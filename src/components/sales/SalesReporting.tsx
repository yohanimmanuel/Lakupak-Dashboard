'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Calendar, Clock, MapPin, Trash2, Edit } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { useSalesTranslations } from '@/hooks/useSalesTranslations';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

interface FieldReport {
  id: string;
  date: string;
  activities?: {
    visits: number;
    customersMet: number;
    productsDemonstrated: number;
    salesMade: number;
    manualOverride?: boolean;
  };
  notes?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
}

interface SalesReportingProps {
  formData: Partial<SalesAgent>;
  onFormChange: (updates: Partial<SalesAgent>) => void;
  onTabCompletion: (tabId: 'reporting', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

/**
 * Normalizes a date string to YYYY-MM-DD format.
 * Returns today's date if input is undefined or invalid.
 */
const normalizeDateString = (dateInput: string | undefined): string => {
  if (!dateInput) {
    return new Date().toISOString().split('T')[0];
  }
  
  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  
  return parsed.toISOString().split('T')[0];
};

export default function SalesReporting({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
}: SalesReportingProps) {
  const { tSalesReporting } = useSalesTranslations();
  const userId = useUserStore((state) => state.user?.id);
  const [jobDays, setJobDays] = useState<Record<string, { visits: number; customersMet: number; productsDemonstrated: number; salesMade: number }>>({});
  const [reports, setReports] = useState<FieldReport[]>(() => {
    // Use existing reports from formData if available (both create and edit mode)
    if (formData.fieldReports && formData.fieldReports.length > 0) {
      return formData.fieldReports.map(r => ({
        id: r.id || `report-${Date.now()}-${Math.random()}`,
        date: normalizeDateString(r.date),
        location: r.location,
        startTime: r.startTime,
        endTime: r.endTime,
        activities: r.activities,
        notes: r.notes,
      }));
    }
    // For create mode or when no reports exist, show 1 placeholder
    return [
      {
        id: 'placeholder-1',
        date: new Date().toISOString().split('T')[0],
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
  });

  // Use ref to track previous formData.fieldReports to avoid unnecessary updates
  const prevFormDataReportsRef = useRef<typeof formData.fieldReports>(undefined);
  const reportsRef = useRef(reports);
  reportsRef.current = reports; // Keep ref in sync

  // Sync reports with formData when it changes (both create and edit mode)
  useEffect(() => {
    // Only update if formData.fieldReports actually changed
    if (formData.fieldReports !== prevFormDataReportsRef.current) {
      prevFormDataReportsRef.current = formData.fieldReports;
      
      if (formData.fieldReports && formData.fieldReports.length > 0) {
        const formReports = formData.fieldReports.map(r => ({
          id: r.id || `report-${Date.now()}-${Math.random()}`,
          date: normalizeDateString(r.date),
          location: r.location,
          startTime: r.startTime,
          endTime: r.endTime,
          activities: r.activities,
          notes: r.notes,
        }));
        // Use shallow comparison for length and IDs to avoid JSON.stringify
        const currentReports = reportsRef.current;
        const hasChanged = currentReports.length !== formReports.length ||
          currentReports.some((r, idx) => r.id !== formReports[idx]?.id || r.date !== formReports[idx]?.date);
        if (hasChanged) {
          setReports(formReports);
        }
      }
      // If formData was cleared, keep local state (user might be editing)
      // Don't reset to placeholder if user has entered data
    }
  }, [formData.fieldReports]); // Only depend on formData.fieldReports

  // Update tab completion - reporting is optional
  // onTabCompletion is wrapped in useCallback in parent, so it's stable
  useEffect(() => {
    onTabCompletion('reporting', true);
  }, [onTabCompletion]);

  useEffect(() => {
    if (!userId || !formData.id) return;
    fetchGraphQL<{ salesJobDayAggregates: { date: string; visits: number; customersMet: number; productsDemonstrated: number; salesMade: number }[] }>(
      `query JobDays($userId: Int!, $agentId: String!) {
        salesJobDayAggregates(userId: $userId, agentId: $agentId) { date visits customersMet productsDemonstrated salesMade }
      }`,
      { userId, agentId: formData.id },
    )
      .then((data) => {
        const next: Record<string, { visits: number; customersMet: number; productsDemonstrated: number; salesMade: number }> = {};
        for (const row of data.salesJobDayAggregates) next[row.date] = row;
        setJobDays(next);
      })
      .catch(() => setJobDays({}));
  }, [userId, formData.id]);

  useEffect(() => {
    if (Object.keys(jobDays).length === 0) return;
    let changed = false;
    const next = reportsRef.current.map((report) => {
      if (report.activities?.manualOverride) return report;
      const agg = jobDays[report.date.slice(0, 10)];
      if (!agg) return report;
      const current = report.activities;
      if (
        current &&
        current.visits === agg.visits &&
        current.customersMet === agg.customersMet &&
        current.productsDemonstrated === agg.productsDemonstrated &&
        current.salesMade === agg.salesMade
      ) {
        return report;
      }
      changed = true;
      return { ...report, activities: { ...agg } };
    });
    if (!changed) return;
    setReports(next);
    onFormChange({
      fieldReports: next.map((report) => ({
        id: report.id,
        date: report.date,
        location: report.location,
        startTime: report.startTime,
        endTime: report.endTime,
        activities: report.activities,
        notes: report.notes,
      })),
    });
  }, [jobDays, onFormChange]);

  const handleAddReport = () => {
    const newReport: FieldReport = {
      id: `report-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
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
    const updatedReports = [...reports, newReport];
    setReports(updatedReports);
    // Sync with formData
    onFormChange({ 
      fieldReports: updatedReports.map(r => ({
        id: r.id,
        date: r.date,
        location: r.location,
        startTime: r.startTime,
        endTime: r.endTime,
        activities: r.activities,
        notes: r.notes,
      }))
    });
  };

  const handleDeleteReport = (reportId: string) => {
    if (reports.length > 1) {
      const updatedReports = reports.filter(r => r.id !== reportId);
      setReports(updatedReports);
      // Sync with formData
      onFormChange({ 
        fieldReports: updatedReports.map(r => ({
          id: r.id,
          date: r.date,
          location: r.location,
          startTime: r.startTime,
          endTime: r.endTime,
          activities: r.activities,
          notes: r.notes,
        }))
      });
    }
  };

  const handleUpdateReport = (reportId: string, updates: Partial<FieldReport>) => {
    let nextUpdates = updates;
    if (updates.activities && !updates.date) {
      nextUpdates = { ...updates, activities: { ...updates.activities, manualOverride: true } };
    } else if (updates.date) {
      const current = reports.find((report) => report.id === reportId);
      const agg = jobDays[updates.date.slice(0, 10)];
      if (agg && !current?.activities?.manualOverride) {
        nextUpdates = { ...updates, activities: { ...agg } };
      }
    }
    const updatedReports = reports.map(r => r.id === reportId ? { ...r, ...nextUpdates } : r);
    setReports(updatedReports);
    // Sync with formData
    onFormChange({ 
      fieldReports: updatedReports.map(r => ({
        id: r.id,
        date: r.date,
        location: r.location,
        startTime: r.startTime,
        endTime: r.endTime,
        activities: r.activities,
        notes: r.notes,
      }))
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{tSalesReporting('title')}</h3>
        </div>
        <button
          onClick={handleAddReport}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {tSalesReporting('addReport')}
        </button>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {reports.map((report) => (
          <div key={report.id} className="border border-[#e6e6e6] rounded-lg p-4">
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
                  aria-label={tSalesReporting('deleteReport')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Working Hours and Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('startTime')}</label>
                  <input
                    type="time"
                    value={report.startTime || '08:00'}
                    onChange={(e) => handleUpdateReport(report.id, { startTime: e.target.value })}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                  />
                </div>
                <span className="text-gray-400 mx-2">-</span>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('endTime')}</label>
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
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('location')}</label>
                  <input
                    type="text"
                    value={report.location || ''}
                    onChange={(e) => handleUpdateReport(report.id, { location: e.target.value })}
                    placeholder={tSalesReporting('locationPlaceholder')}
                    className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                  />
                </div>
              </div>
            </div>

            {/* Activities Summary */}
            <div className="border border-[#e6e6e6] rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {tSalesReporting('dailyActivities')}
              </h4>
              <p className="text-xs text-gray-500 mb-4">{tSalesReporting('prefilledFromJobs')}</p>
              <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('visits')}</label>
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
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('customersMet')}</label>
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
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('productsDemonstrated')}</label>
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
                  <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('salesMade')}</label>
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
              <label className="text-xs text-gray-500 mb-1 block">{tSalesReporting('notes')}</label>
              <textarea
                value={report.notes || ''}
                onChange={(e) => handleUpdateReport(report.id, { notes: e.target.value })}
                placeholder={tSalesReporting('notesPlaceholder')}
                rows={3}
                className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] resize-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">{tSalesReporting('note')}</p>
      </div>
    </div>
  );
}

