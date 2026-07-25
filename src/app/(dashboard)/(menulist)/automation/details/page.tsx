'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WorkflowBuilderShell } from '@/components/automations/builder/WorkflowBuilderShell';
import { WorkflowCanvas } from '@/components/automations/builder/WorkflowCanvas';
import {
  WorkflowDetailsPanel,
  StepDetailsPanel,
  type WorkflowDraft,
} from '@/components/automations/builder/WorkflowInspector';
import {
  createLegacyFlatCanvas,
  deriveFlatFieldsFromCanvas,
  packAgentConfig,
  unpackCanvasFromAgentConfig,
} from '@/components/automations/builder/canvasUtils';
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
} from '@/components/automations/builder/canvasTypes';
import type {
  AutomationRun,
  AutomationWorkflow,
  WorkflowType,
} from '@/components/automations/automationTypes';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

const WORKFLOW_QUERY = `
  query GetAutomationWorkflow($id: String!) {
    automationWorkflow(id: $id) {
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
    automationRuns(workflowId: $id, limit: 20) {
      id
      workflowId
      status
      message
      createdAt
    }
  }
`;

const UPDATE_MUTATION = `
  mutation UpdateAutomationWorkflow(
    $id: String!
    $name: String
    $description: String
    $type: String
    $status: String
    $triggerType: String
    $triggerConfig: JSONObject
    $agentConfig: JSONObject
    $actionType: String
    $actionConfig: JSONObject
  ) {
    updateAutomationWorkflow(
      id: $id
      name: $name
      description: $description
      type: $type
      status: $status
      triggerType: $triggerType
      triggerConfig: $triggerConfig
      agentConfig: $agentConfig
      actionType: $actionType
      actionConfig: $actionConfig
    ) {
      id
      status
      updatedAt
    }
  }
`;

const TEST_MUTATION = `
  mutation TestAutomationWorkflow($id: String!) {
    testAutomationWorkflow(id: $id) {
      id
      workflowId
      status
      message
      createdAt
    }
  }
`;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function DetailsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams?.get('id') ?? null;
  const user = useUserStore((s) => s.user);
  const { tBuilder, translateTrigger, translateAction } = useAutomationTranslations();

  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const latestIdRef = useRef(id);
  const loadSeqRef = useRef(0);
  latestIdRef.current = id;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user?.id || !id) {
      setLoading(false);
      return;
    }
    const requestedId = id;
    const seq = ++loadSeqRef.current;
    const isCurrent = () =>
      seq === loadSeqRef.current && latestIdRef.current === requestedId;

    if (!opts?.silent) setLoading(true);
    try {
      const data = await fetchGraphQL<{
        automationWorkflow: AutomationWorkflow | null;
        automationRuns: AutomationRun[];
      }>(WORKFLOW_QUERY, { id: requestedId });
      if (!isCurrent()) return;
      if (!data.automationWorkflow) {
        setError(tBuilder('notFound'));
        setDraft(null);
        return;
      }
      const w = data.automationWorkflow;
      const agentConfig = asRecord(w.agentConfig);
      const unpacked = unpackCanvasFromAgentConfig(agentConfig);
      const type = w.type as WorkflowType;

      let nodes: WorkflowFlowNode[];
      let edges: WorkflowFlowEdge[];

      if (unpacked) {
        nodes = unpacked.nodes;
        edges = unpacked.edges;
      } else {
        const canvas = createLegacyFlatCanvas(
          type,
          {
            triggerTitle: tBuilder('nodeTrigger'),
            triggerSubtitle: translateTrigger(w.triggerType),
            agentTitle: tBuilder('nodeAgent'),
            agentSubtitle: tBuilder('nodeAgent'),
            actionTitle: tBuilder('nodeAction'),
            actionSubtitle: translateAction(w.actionType),
          },
          {
            triggerType: w.triggerType,
            triggerConfig: asRecord(w.triggerConfig),
            actionType: w.actionType,
            actionConfig: asRecord(w.actionConfig),
            agentNote: String(agentConfig.note ?? ''),
          },
        );
        nodes = canvas.nodes;
        edges = canvas.edges;
      }

      if (!isCurrent()) return;
      setDraft({
        name: w.name,
        description: w.description,
        type,
        status: w.status,
        nodes,
        edges,
      });
      setSelectedNodeId((prev) => prev ?? nodes[0]?.id ?? null);
      setRuns(data.automationRuns ?? []);
      setError(null);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : tBuilder('loadFailed'));
    } finally {
      if (!opts?.silent && isCurrent()) setLoading(false);
    }
  }, [user?.id, id, tBuilder, translateAction, translateTrigger]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user?.id || !id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        await load({ silent: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Only re-fetch when the workflow or user changes — not on translator identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is intentionally omitted
  }, [user?.id, id]);

  const patch = (next: Partial<WorkflowDraft>) => {
    if (next.name !== undefined) setNameError(null);
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  };

  const updateNode = (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            nodes: prev.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n,
            ),
          }
        : prev,
    );
  };

  const deleteNode = (nodeId: string) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            nodes: prev.nodes.filter((n) => n.id !== nodeId),
            edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          }
        : prev,
    );
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  };

  const disconnectNode = (nodeId: string) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          }
        : prev,
    );
  };

  const save = async (
    statusOverride?: 'draft' | 'active',
    opts?: { manageSaving?: boolean },
  ): Promise<boolean> => {
    if (!user?.id || !id || !draft) return false;
    if (!draft.name.trim()) {
      setNameError(tBuilder('nameRequired'));
      setFormError(null);
      return false;
    }
    const manageSaving = opts?.manageSaving !== false;
    if (manageSaving) setSaving(true);
    setNameError(null);
    setFormError(null);
    try {
      const flat = deriveFlatFieldsFromCanvas(draft.nodes);
      await fetchGraphQL(UPDATE_MUTATION, {
        id,
        name: draft.name.trim(),
        description: draft.description,
        type: draft.type,
        status: statusOverride ?? draft.status,
        triggerType: flat.triggerType,
        triggerConfig: flat.triggerConfig,
        agentConfig: packAgentConfig(flat.agentNote, draft.nodes, draft.edges),
        actionType: flat.actionType,
        actionConfig: flat.actionConfig,
      });
      if (statusOverride) {
        setDraft((prev) => (prev ? { ...prev, status: statusOverride } : prev));
      }
      // Refresh runs/metadata in place — do not full-reload (that remounts the
      // builder and clears the "Saved just now" indicator).
      await load({ silent: true });
      return true;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tBuilder('saveFailed'));
      return false;
    } finally {
      if (manageSaving) setSaving(false);
    }
  };

  const testRun = async () => {
    if (!user?.id || !id) return;
    setSaving(true);
    try {
      await save(undefined, { manageSaving: false });
      const data = await fetchGraphQL<{ testAutomationWorkflow: AutomationRun }>(TEST_MUTATION, {
        id,
      });
      setRuns((prev) => [data.testAutomationWorkflow, ...prev]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tBuilder('testFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{tBuilder('missingId')}</p>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-[#0a61d7]"
          onClick={() => router.push('/automation')}
        >
          {tBuilder('back')}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
          <p className="text-gray-600">{tBuilder('loading')}</p>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600">{error || tBuilder('notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <WorkflowBuilderShell
      title={draft.name || tBuilder('untitled')}
      status={draft.status}
      saving={saving}
      showTestRun
      onSaveDraftAction={() => save('draft')}
      onActivateAction={() => void save('active')}
      onTestRunAction={() => void testRun()}
      canvas={
        <WorkflowCanvas
          workflowType={draft.type}
          nodes={draft.nodes}
          edges={draft.edges}
          selectedNodeId={selectedNodeId}
          onNodesChangeAction={(nodes) => patch({ nodes })}
          onEdgesChangeAction={(edges) => patch({ edges })}
          onSelectNodeAction={setSelectedNodeId}
        />
      }
      leftPanel={
        <>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <WorkflowDetailsPanel
            draft={draft}
            onChangeAction={patch}
            nameError={nameError}
            formError={formError}
          />
        </>
      }
      rightPanelOpen={selectedNodeId !== null}
      rightPanel={
        <StepDetailsPanel
          draft={draft}
          selectedNodeId={selectedNodeId}
          onUpdateNodeAction={updateNode}
          onDeleteNodeAction={deleteNode}
          onDisconnectNodeAction={disconnectNode}
          onCloseAction={() => setSelectedNodeId(null)}
          runs={runs}
        />
      }
    />
  );
}

export default function AutomationDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#0a61d7] border-t-transparent" />
            <p className="text-gray-600">Loading…</p>
          </div>
        </div>
      }
    >
      <DetailsInner />
    </Suspense>
  );
}
