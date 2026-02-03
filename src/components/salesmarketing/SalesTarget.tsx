'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Target, Plus, Trash2, DollarSign } from 'lucide-react';
import { SalesAgent } from './TeamList';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';

interface SalesTargetRow {
  id: string;
  period: string;
  goal: number;
  achieved: number;
  unitsSold: number;
}

interface SalesTargetProps {
  formData: Partial<SalesAgent>;
  onFormChange: (updates: Partial<SalesAgent>) => void;
  onTabCompletion: (tabId: 'target', isComplete: boolean) => void;
  mode: 'create' | 'edit';
}

export default function SalesTarget({
  formData,
  onFormChange,
  onTabCompletion,
  mode,
}: SalesTargetProps) {
  const user = useUserStore(state => state.user);
  const [targetRows, setTargetRows] = useState<SalesTargetRow[]>(() => {
    // Use existing targets from formData if available (both create and edit mode)
    if (formData.salesTargets && formData.salesTargets.length > 0) {
      return formData.salesTargets.map(t => ({
        id: t.id || `target-${Date.now()}-${Math.random()}`,
        period: t.period,
        goal: t.goal,
        achieved: t.achieved || 0,
        unitsSold: t.unitsSold || 0,
      }));
    }
    // For create mode or when no targets exist, show 1 placeholder
    return [
      {
        id: 'target-placeholder-1',
        period: '',
        goal: 0,
        achieved: 0,
        unitsSold: 0,
      },
    ];
  });

  const userCurrency = user?.currency || getDefaultCurrency();

  // Use ref to track previous formData.salesTargets to avoid unnecessary updates
  const prevFormDataTargetsRef = useRef<typeof formData.salesTargets>();
  const targetRowsRef = useRef(targetRows);
  targetRowsRef.current = targetRows; // Keep ref in sync

  // Sync targets with formData when it changes (both create and edit mode)
  useEffect(() => {
    // Only update if formData.salesTargets actually changed
    if (formData.salesTargets !== prevFormDataTargetsRef.current) {
      prevFormDataTargetsRef.current = formData.salesTargets;
      
      if (formData.salesTargets && formData.salesTargets.length > 0) {
        const formTargets = formData.salesTargets.map(t => ({
          id: t.id || `target-${Date.now()}-${Math.random()}`,
          period: t.period,
          goal: t.goal,
          achieved: t.achieved || 0,
          unitsSold: t.unitsSold || 0,
        }));
        // Use shallow comparison for length and key fields to avoid JSON.stringify
        const currentTargets = targetRowsRef.current;
        const hasChanged = currentTargets.length !== formTargets.length ||
          currentTargets.some((t, idx) => 
            t.id !== formTargets[idx]?.id || 
            t.period !== formTargets[idx]?.period || 
            t.goal !== formTargets[idx]?.goal
          );
        if (hasChanged) {
          setTargetRows(formTargets);
        }
      }
      // If formData was cleared, keep local state (user might be editing)
      // Don't reset to placeholder if user has entered data
    }
  }, [formData.salesTargets]); // Only depend on formData.salesTargets

  // Calculate tab completion during render (not in useEffect)
  const hasValidTargets = useMemo(() => {
    return targetRows.some(row => 
      row.period.trim() && row.goal > 0
    );
  }, [targetRows]);

  // Only call onTabCompletion when completion status actually changes
  // onTabCompletion is wrapped in useCallback in parent, so it's stable
  useEffect(() => {
    onTabCompletion('target', hasValidTargets);
  }, [hasValidTargets, onTabCompletion]);

  const handleAddRow = () => {
    const newRow: SalesTargetRow = {
      id: `target-${Date.now()}`,
      period: '',
      goal: 0,
      achieved: 0,
      unitsSold: 0,
    };
    const updatedRows = [...targetRows, newRow];
    setTargetRows(updatedRows);
    // Sync with formData
    onFormChange({ 
      salesTargets: updatedRows.map(r => ({
        id: r.id,
        period: r.period,
        goal: r.goal,
        achieved: r.achieved,
        unitsSold: r.unitsSold,
      }))
    });
  };

  const handleDeleteRow = (rowId: string) => {
    if (targetRows.length > 1) {
      const updatedRows = targetRows.filter(r => r.id !== rowId);
      setTargetRows(updatedRows);
      // Sync with formData
      onFormChange({ 
        salesTargets: updatedRows.map(r => ({
          id: r.id,
          period: r.period,
          goal: r.goal,
          achieved: r.achieved,
          unitsSold: r.unitsSold,
        }))
      });
    }
  };

  const handleUpdateRow = (rowId: string, field: keyof SalesTargetRow, value: string | number) => {
    const updatedRows = targetRows.map(r => 
      r.id === rowId ? { ...r, [field]: value } : r
    );
    setTargetRows(updatedRows);
    // Sync with formData
    onFormChange({ 
      salesTargets: updatedRows.map(r => ({
        id: r.id,
        period: r.period,
        goal: r.goal,
        achieved: r.achieved,
        unitsSold: r.unitsSold,
      }))
    });
  };

  const formatCurrencyAmount = (amount: number) => {
    if (!amount) return '';
    return formatCurrency(amount, userCurrency);
  };

  // Common month options
  const monthOptions = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Sales Target</h3>
          <p className="text-sm text-gray-500">Set sales goals and targets for this agent</p>
        </div>
        <button
          onClick={handleAddRow}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Row
        </button>
      </div>

      {/* Sales Target Table */}
      <div className="border border-[#e6e6e6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b border-[#e6e6e6]">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Goal ({userCurrency})
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Achieved ({userCurrency})
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Sold
                </th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {targetRows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={row.period}
                      onChange={(e) => handleUpdateRow(row.id, 'period', e.target.value)}
                      placeholder="e.g., October"
                      list="months-list"
                      className="w-full text-xs text-black border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
                    />
                    <datalist id="months-list">
                      {monthOptions.map(month => (
                        <option key={month} value={month} />
                      ))}
                    </datalist>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={row.goal || ''}
                        onChange={(e) => handleUpdateRow(row.id, 'goal', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full text-xs text-black text-right border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
                        min="0"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={row.achieved || ''}
                        onChange={(e) => handleUpdateRow(row.id, 'achieved', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full text-xs text-black text-right border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
                        min="0"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      value={row.unitsSold || ''}
                      onChange={(e) => handleUpdateRow(row.id, 'unitsSold', parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full text-xs text-black text-right border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent"
                      min="0"
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    {targetRows.length > 1 && (
                      <button
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="Delete row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary (if there are targets) */}
      {targetRows.length > 0 && targetRows.some(r => r.goal > 0) && (
        <div className="bg-gray-50 border border-[#e6e6e6] rounded-lg p-3">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Summary</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Goal</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrencyAmount(targetRows.reduce((sum, r) => sum + (r.goal || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Achieved</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrencyAmount(targetRows.reduce((sum, r) => sum + (r.achieved || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Units Sold</p>
              <p className="text-sm font-semibold text-gray-900">
                {targetRows.reduce((sum, r) => sum + (r.unitsSold || 0), 0)} Units
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Add sales targets by period (month, quarter, or year). The Goal column is required. 
          Achieved and Unit Sold can be updated as sales progress.
        </p>
      </div>
    </div>
  );
}

