'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import AutomationStatcards from '@/components/automations/AutomationStatcards';
import AutomationTable from '@/components/automations/AutomationTable';
import {
  AutomationWorkflow,
  AutomationWorkflowRow,
  WorkflowStatus,
  toWorkflowRow,
} from '@/components/automations/automationTypes';
import { SkeletonTablePage } from '@/components/skeleton/SkeletonTablePage';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { usePendingDashboardTourStart } from '@/hooks/usePendingDashboardTourStart';
import { requestGlanceRefresh } from '@/lib/navbar/glanceRefresh';

const WORKFLOWS_QUERY = `
  query GetAutomationWorkflows($page: Int, $limit: Int) {
    automationWorkflows(page: $page, limit: $limit) {
      nodes {
        id
        userId
        name
        description
        type
        status
        triggerType
        triggerConfig
        agentConfig
        actionType
        actionConfig
        runs
        lastRunAt
        createdAt
        updatedAt
      }
    }
  }
`;

const DELETE_MUTATION = `
  mutation DeleteAutomationWorkflow($id: String!) {
    deleteAutomationWorkflow(id: $id) {
      success
    }
  }
`;

const SET_STATUS_MUTATION = `
  mutation SetAutomationWorkflowStatus($ids: [String!]!, $status: String!) {
    setAutomationWorkflowStatus(ids: $ids, status: $status) {
      success
      updatedCount
    }
  }
`;

export default function AutomationPage() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const { tPage, translateTrigger } = useAutomationTranslations();
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows: AutomationWorkflowRow[] = useMemo(
    () => workflows.map((w) => toWorkflowRow(w, translateTrigger(w.triggerType))),
    [workflows, translateTrigger],
  );

  const fetchWorkflows = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!user?.id) {
      setInitialLoading(false);
      setRefreshing(false);
      setWorkflows([]);
      return;
    }
    if (mode === 'refresh') setRefreshing(true);
    else setInitialLoading(true);
    try {
      const data = await fetchGraphQL<{
        automationWorkflows: { nodes: AutomationWorkflow[] };
      }>(WORKFLOWS_QUERY, { page: 1, limit: 100 });
      setWorkflows(data.automationWorkflows.nodes);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : tPage('loadFailed'));
    } finally {
      if (mode === 'refresh') setRefreshing(false);
      else setInitialLoading(false);
    }
  }, [user?.id, tPage]);

  useEffect(() => {
    void fetchWorkflows('initial');
  }, [fetchWorkflows]);

  usePendingDashboardTourStart('automation', { ready: !initialLoading && !!user?.id });

  const handleDelete = async (id: string) => {
    if (!user?.id) return;
    try {
      await fetchGraphQL(DELETE_MUTATION, { id });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : tPage('deleteFailed'));
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (!user?.id || ids.length === 0) return;
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        await fetchGraphQL(DELETE_MUTATION, { id });
        return id;
      }),
    );
    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value);
    if (succeeded.length > 0) {
      setWorkflows((prev) => prev.filter((w) => !succeeded.includes(w.id)));
    }
    const failedCount = results.length - succeeded.length;
    if (failedCount > 0) {
      const firstFailure = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      const fallback = tPage('deleteFailed');
      const detail =
        firstFailure?.reason instanceof Error ? firstFailure.reason.message : fallback;
      setActionError(
        failedCount === ids.length
          ? detail
          : tPage('bulkDeletePartialFailed', { failed: failedCount, total: ids.length }),
      );
    } else {
      setActionError(null);
    }
  };

  const handleStatusChange = async (ids: string[], status: WorkflowStatus) => {
    if (!user?.id) return;
    try {
      await fetchGraphQL(SET_STATUS_MUTATION, { ids, status });
      setWorkflows((prev) =>
        prev.map((w) => (ids.includes(w.id) ? { ...w, status } : w)),
      );
      requestGlanceRefresh();
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : tPage('statusChangeFailed'));
    }
  };

  if (initialLoading) {
    return <SkeletonTablePage statCards={4} rows={8} />;
  }

  return (
    <div className="p-4 w-full min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div data-tour="automation-page-header">
          <h2 className="text-2xl font-bold text-black mb-2">{tPage('title')}</h2>
        </div>
        <div className="flex gap-2 items-center" data-tour="automation-actions">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
            onClick={() => void fetchWorkflows('refresh')}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {tPage('refresh')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/automation/new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm"
          >
            <Plus className="w-4 h-4" /> {tPage('newWorkflow')}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div data-tour="automation-stats">
        <AutomationStatcards workflows={rows} />
      </div>
      <div data-tour="automation-table">
        <AutomationTable
          workflows={rows}
          onDeleteAction={(id) => void handleDelete(id)}
          onBulkDeleteAction={(ids) => void handleBulkDelete(ids)}
          onStatusChangeAction={(ids, status) => void handleStatusChange(ids, status)}
          onEditAction={(id) => router.push(`/automation/details?id=${id}`)}
        />
      </div>
    </div>
  );
}
