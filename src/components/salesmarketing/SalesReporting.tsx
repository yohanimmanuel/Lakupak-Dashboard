'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Calendar, Clock, MapPin, Trash2, Edit } from 'lucide-react';
import { SalesAgent } from './TeamList';

interface FieldReport {
  id: string;
  date: string;
  status: 'pending' | 'reviewed';
  activities?: {
    visits: number;
    customersMet: number;
    productsDemonstrated: number;
    salesMade: number;
  };
  notes?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

interface SalesReportingProps {
  formData: Partial<SalesAgent>;
  onFormChange: (updates: Partial<SalesAgent>) => void;
  onTabCompletion: (tabId: 'reporting', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

export default function SalesReporting({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
}: SalesReportingProps) {
  const [reports, setReports] = useState<FieldReport[]>(() => {
    // Show 1 placeholder row for new agents, or existing reports for edit mode
    if (mode === 'edit' && formData.id) {
      // In production, this would come from formData or API
      return [
        {
          id: '1',
          date: new Date().toISOString().split('T')[0],
          status: 'pending',
          activities: {
            visits: 0,
            customersMet: 0,
            productsDemonstrated: 0,
            salesMade: 0,
          },
          notes: '',
          location: formData.territory || '',
          startTime: '08:00',
          endTime: '17:00',
        },
      ];
    }
    // For create mode, show 1 placeholder
    return [
      {
        id: 'placeholder-1',
        date: new Date().toISOString().split('T')[0],
        status: 'pending',
        activities: {
          visits: 0,
          customersMet: 0,
          productsDemonstrated: 0,
          salesMade: 0,
        },
        notes: '',
        location: '',
        startTime: '08:00',
        endTime: '17:00',
      },
    ];
  });

  // Update tab completion - reporting is optional
  useEffect(() => {
    onTabCompletion('reporting', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const handleAddReport = () => {
    const newReport: FieldReport = {
      id: `report-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      activities: {
        visits: 0,
        customersMet: 0,
        productsDemonstrated: 0,
        salesMade: 0,
      },
      notes: '',
      location: formData.territory || '',
      startTime: '08:00',
      endTime: '17:00',
    };
    setReports([...reports, newReport]);
  };

  const handleDeleteReport = (reportId: string) => {
    if (reports.length > 1) {
      setReports(reports.filter(r => r.id !== reportId));
    }
  };

  const handleUpdateReport = (reportId: string, updates: Partial<FieldReport>) => {
    setReports(reports.map(r => r.id === reportId ? { ...r, ...updates } : r));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Daily Field Reports</h3>
          <p className="text-sm text-gray-500">Manage daily field activity reports for this agent</p>
        </div>
        <button
          onClick={handleAddReport}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Report
        </button>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {reports.map((report) => (
          <div key={report.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={report.date}
                  onChange={(e) => handleUpdateReport(report.id, { date: e.target.value })}
                  className="text-sm font-medium text-gray-900 border border-gray-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                />
              </div>
              {reports.length > 1 && (
                <button
                  onClick={() => handleDeleteReport(report.id)}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Delete report"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Working Hours and Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
                  <input
                    type="time"
                    value={report.startTime || '08:00'}
                    onChange={(e) => handleUpdateReport(report.id, { startTime: e.target.value })}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                  />
                </div>
                <span className="text-gray-400 mx-2">-</span>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">End Time</label>
                  <input
                    type="time"
                    value={report.endTime || '17:00'}
                    onChange={(e) => handleUpdateReport(report.id, { endTime: e.target.value })}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Location</label>
                  <input
                    type="text"
                    value={report.location || ''}
                    onChange={(e) => handleUpdateReport(report.id, { location: e.target.value })}
                    placeholder="e.g., Jakarta & West Java"
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                  />
                </div>
              </div>
            </div>

            {/* Activities Summary */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Daily Activities
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Visits</label>
                  <input
                    type="number"
                    value={report.activities?.visits || 0}
                    onChange={(e) => {
                      const currentActivities = report.activities || {
                        visits: 0,
                        customersMet: 0,
                        productsDemonstrated: 0,
                        salesMade: 0,
                      };
                      handleUpdateReport(report.id, {
                        activities: {
                          ...currentActivities,
                          visits: parseInt(e.target.value) || 0,
                        }
                      });
                    }}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Customers Met</label>
                  <input
                    type="number"
                    value={report.activities?.customersMet || 0}
                    onChange={(e) => {
                      const currentActivities = report.activities || {
                        visits: 0,
                        customersMet: 0,
                        productsDemonstrated: 0,
                        salesMade: 0,
                      };
                      handleUpdateReport(report.id, {
                        activities: {
                          ...currentActivities,
                          customersMet: parseInt(e.target.value) || 0,
                        }
                      });
                    }}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Products Demonstrated</label>
                  <input
                    type="number"
                    value={report.activities?.productsDemonstrated || 0}
                    onChange={(e) => {
                      const currentActivities = report.activities || {
                        visits: 0,
                        customersMet: 0,
                        productsDemonstrated: 0,
                        salesMade: 0,
                      };
                      handleUpdateReport(report.id, {
                        activities: {
                          ...currentActivities,
                          productsDemonstrated: parseInt(e.target.value) || 0,
                        }
                      });
                    }}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sales Made</label>
                  <input
                    type="number"
                    value={report.activities?.salesMade || 0}
                    onChange={(e) => {
                      const currentActivities = report.activities || {
                        visits: 0,
                        customersMet: 0,
                        productsDemonstrated: 0,
                        salesMade: 0,
                      };
                      handleUpdateReport(report.id, {
                        activities: {
                          ...currentActivities,
                          salesMade: parseInt(e.target.value) || 0,
                        }
                      });
                    }}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes & Observations</label>
              <textarea
                value={report.notes || ''}
                onChange={(e) => handleUpdateReport(report.id, { notes: e.target.value })}
                placeholder="Enter notes about the day's activities, customer feedback, challenges, etc."
                rows={3}
                className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] resize-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Daily field reports help track agent activities, customer visits, and sales performance. 
          Reports can be marked as reviewed by managers/admins.
        </p>
      </div>
    </div>
  );
}

