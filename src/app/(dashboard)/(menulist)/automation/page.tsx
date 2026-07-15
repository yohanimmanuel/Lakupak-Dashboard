'use client';

import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import AutomationStatcards from '@/components/automations/AutomationStatcards';
import AutomationTable from '@/components/automations/AutomationTable';
import { MOCK_WORKFLOWS } from '@/components/automations/automationMockData';
import { AutomationWorkflow, WorkflowStatus } from '@/components/automations/automationTypes';

export default function AutomationPage() {
  const { tPage } = useAutomationTranslations();
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>(MOCK_WORKFLOWS);

  const handleDelete = (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  };

  const handleBulkDelete = (ids: string[]) => {
    setWorkflows((prev) => prev.filter((w) => !ids.includes(w.id)));
  };

  const handleStatusChange = (ids: string[], status: WorkflowStatus) => {
    setWorkflows((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, status } : w)));
  };

  const handleRefresh = () => {
    setWorkflows(MOCK_WORKFLOWS);
  };

  return (
    <div className="p-4 w-full min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-black mb-2">{tPage('title')}</h2>
        </div>
        <div className="flex gap-2 items-center">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4" /> {tPage('refresh')}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm">
            <Plus className="w-4 h-4" /> {tPage('newWorkflow')}
          </button>
        </div>
      </div>

      <AutomationStatcards workflows={workflows} />
      <AutomationTable
        workflows={workflows}
        onDeleteAction={handleDelete}
        onBulkDeleteAction={handleBulkDelete}
        onStatusChangeAction={handleStatusChange}
      />
    </div>
  );
}
