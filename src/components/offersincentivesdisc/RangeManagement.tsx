'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Plus, Edit, Trash2, Target, AlertCircle, CheckCircle } from 'lucide-react';

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
}

export default function RangeManagement() {
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
    },
    {
      id: '2',
      name: 'Lunch Break',
      startTime: '12:00',
      endTime: '14:00',
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      isActive: true,
      offerCount: 3,
    },
    {
      id: '3',
      name: 'Weekend Special',
      startTime: '09:00',
      endTime: '18:00',
      days: ['Saturday', 'Sunday'],
      isActive: false,
      offerCount: 7,
    },
  ];

  const getDateRangeStatus = (startDate: string, endDate: string, isActive: boolean) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!isActive) return { status: 'inactive', color: 'text-gray-600', bg: 'bg-gray-100', icon: AlertCircle };
    if (now < start) return { status: 'upcoming', color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock };
    if (now > end) return { status: 'expired', color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle };
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-black">Range Management</h2>
          <p className="text-gray-500 text-sm">Manage date ranges and time slots for offers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Range
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
        <button
          onClick={() => setActiveTab('date')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'date'
              ? 'bg-[#0a61d7] text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Date Ranges
        </button>
        <button
          onClick={() => setActiveTab('time')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'time'
              ? 'bg-[#0a61d7] text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          Time Slots
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-600 font-medium">Date Ranges</p>
              <p className="text-2xl font-bold text-blue-800">{dateRanges.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-green-600 font-medium">Time Slots</p>
              <p className="text-2xl font-bold text-green-800">{timeSlots.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="flex items-center gap-3">
            <Target className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-sm text-orange-600 font-medium">Active Ranges</p>
              <p className="text-2xl font-bold text-orange-800">
                {dateRanges.filter(r => r.isActive).length + timeSlots.filter(t => t.isActive).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Offers</p>
              <p className="text-2xl font-bold text-purple-800">
                {dateRanges.reduce((sum, r) => sum + r.offerCount, 0) + 
                 timeSlots.reduce((sum, t) => sum + t.offerCount, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'date' ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-black">Date Ranges</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dateRanges.map((range) => {
              const status = getDateRangeStatus(range.startDate, range.endDate, range.isActive);
              const daysRemaining = getDaysRemaining(range.endDate);
              const StatusIcon = status.icon;

              return (
                <div key={range.id} className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-black mb-1">{range.name}</h4>
                      <p className="text-sm text-gray-600 mb-2">{range.description}</p>
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-4 h-4 ${status.color}`} />
                        <span className={`text-sm font-medium ${status.color}`}>
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
                      title={range.isActive ? 'Active' : 'Inactive'}
                    />
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Start Date:</span>
                      <span className="font-medium text-black">
                        {new Date(range.startDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">End Date:</span>
                      <span className="font-medium text-black">
                        {new Date(range.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Associated Offers:</span>
                      <span className="font-medium text-black">{range.offerCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                      Created: {new Date(range.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(range)}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Edit Range"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(range.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {timeSlots.map((slot) => (
              <div key={slot.id} className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-black mb-1">{slot.name}</h4>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-black">
                        {slot.startTime} - {slot.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {slot.isActive ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-gray-600" />
                      )}
                      <span className={`text-sm font-medium ${slot.isActive ? 'text-green-600' : 'text-gray-600'}`}>
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
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Days:</span>
                    <span className="font-medium text-black">{slot.days.join(', ')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Associated Offers:</span>
                    <span className="font-medium text-black">{slot.offerCount}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(slot)}
                      className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                      title="Edit Time Slot"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(slot.id)}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
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

      {/* Create/Edit Modal Placeholder */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {showCreateModal ? `Create New ${activeTab === 'date' ? 'Date Range' : 'Time Slot'}` : 
                 `Edit ${activeTab === 'date' ? 'Date Range' : 'Time Slot'}`}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingRange(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="text-gray-500 text-center py-8">
              {activeTab === 'date' ? 'Date range' : 'Time slot'} creation/edit form will be implemented here
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
