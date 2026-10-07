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
  hydrateAppChannelConfig,
  packAgentConfig,
  unpackCanvasFromAgentConfig,
} from '@/components/automations/builder/canvasUtils';
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
} from '@/components/automations/builder/canvasTypes';
import {
  isStructuralCanvasChange,
  useCanvasHistory,
} from '@/components/automations/builder/useCanvasHistory';
import type {
  AutomationRun,
  AutomationWorkflow,
  WorkflowType,
} from '@/components/automations/automationTypes';
import {
  ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE,
  hasAssignDriverWithoutDriver,
} from '@/lib/automations/catalog';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useLocale, useTranslations } from 'next-intl';
import { applyFieldUpdates, buildCopilotDraftFromPlan, buildCopilotDraftFromRecipe } from '@/components/automations/buildCopilotDraft';
import { takeCopilotReviewPlan } from '@/lib/lakuAi/copilotReviewPlan';
import { planFromCanvasNodes, type WorkflowCanvasEdit } from '@/lib/lakuAi/workflowPlan';
import { requestGlanceRefresh } from '@/lib/navbar/glanceRefresh';
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
      whatsappPhone
      gmailEmail
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

const RUNS_QUERY = `
  query GetAutomationRuns($id: String!) {
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
    $whatsappPhone: String
    $gmailEmail: String
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
      whatsappPhone: $whatsappPhone
      gmailEmail: $gmailEmail
    ) {
      id
      status
      updatedAt
    }
  }
`;

const TEST_MUTATION = `
  mutation TestAutomationWorkflow($id: String!, $locale: String) {
    testAutomationWorkflow(id: $id, locale: $locale) {
      id
      workflowId
      status
      message
      createdAt
    }
  }
`;

const DELETE_RUN_MUTATION = `
  mutation DeleteAutomationRun($id: String!) {
    deleteAutomationRun(id: $id) {
      success
      deleted {
        id
      }
    }
  }
`;

const CLEAR_RUNS_MUTATION = `
  mutation ClearAutomationRuns($workflowId: String!) {
    clearAutomationRuns(workflowId: $workflowId) {
      success
      deletedCount
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
  const locale = useLocale();
  const tCopilot = useTranslations('dashboard.automation.copilot');
  const { tBuilder, tTriggers, tActions, translateTrigger, translateAction } = useAutomationTranslations();

  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [clearingRuns, setClearingRuns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const latestIdRef = useRef(id);
  const loadSeqRef = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  latestIdRef.current = id;
  const history = useCanvasHistory();
  const applySeqRef = useRef(0);
  const appliedRecipeRef = useRef<string | null>(null);
  const recipeId = searchParams?.get('recipe') ?? null;
  const planFlag = searchParams?.get('plan') ?? null;
  const appliedPlanRef = useRef(false);
  const linkedChatId = searchParams?.get('chat') ?? null;
  const closeAskAiRef = useRef<(() => void) | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean; preserveRuns?: boolean }) => {
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
        nodes: hydrateAppChannelConfig(nodes, {
          whatsappPhone: w.whatsappPhone,
          gmailEmail: w.gmailEmail,
        }),
        edges,
      });
      // A silent refresh only re-reads runs/metadata; the canvas is unchanged,
      // so the undo stack stays valid.
      if (!opts?.silent) history.clear();
      setSelectedNodeId((prev) => prev ?? nodes[0]?.id ?? null);
      if (!opts?.preserveRuns) {
        setRuns(data.automationRuns ?? []);
      }
      setError(null);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : tBuilder('loadFailed'));
    } finally {
      if (!opts?.silent && isCurrent()) setLoading(false);
    }
  }, [user?.id, id, tBuilder, translateAction, translateTrigger, history.clear]);

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

  const applyWorkflowRecipe = useCallback(async (recipeId: string) => {
    const labels = {
      triggerTitle: tBuilder('nodeTrigger'),
      triggerSubtitle: tBuilder('nodeTrigger'),
      agentTitle: tBuilder('nodeAgent'),
      agentSubtitle: tBuilder('nodeAgent'),
      actionTitle: tBuilder('nodeAction'),
      actionSubtitle: tBuilder('nodeAction'),
    };
    const built = buildCopilotDraftFromRecipe({
      recipeId,
      locale,
      labels,
      text: (key) => tCopilot(key),
      has: (key) => tCopilot.has(key),
      triggerLabel: (type) => tTriggers(type),
      hasTrigger: (type) => tTriggers.has(type),
      actionLabel: (type) => tActions(type),
      hasAction: (type) => tActions.has(type),
    });
    if (!built) return;
    const workflowId = latestIdRef.current;
    const seq = ++applySeqRef.current;
    setAiApplying(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    if (seq !== applySeqRef.current) return;
    if (latestIdRef.current !== workflowId) {
      setAiApplying(false);
      return;
    }
    const current = draftRef.current;
    if (current) history.push({ nodes: current.nodes, edges: current.edges }, { force: true });
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            name: built.name.trim(),
            description: built.description,
            type: built.type,
            nodes: built.nodes,
            edges: built.edges,
          }
        : currentDraft,
    );
    setSelectedNodeId(built.nodes[0]?.id ?? null);
    setNameError(null);
    setFormError(null);
    setAiApplying(false);
  }, [history, locale, tActions, tBuilder, tCopilot, tTriggers]);

  const applyWorkflowPlan = useCallback(async (edit: WorkflowCanvasEdit) => {
    const labels = {
      triggerTitle: tBuilder('nodeTrigger'),
      triggerSubtitle: tBuilder('nodeTrigger'),
      agentTitle: tBuilder('nodeAgent'),
      agentSubtitle: tBuilder('nodeAgent'),
      actionTitle: tBuilder('nodeAction'),
      actionSubtitle: tBuilder('nodeAction'),
    };
    const steps = edit.steps?.length ? edit.steps : null;
    const built = steps
      ? buildCopilotDraftFromPlan({
          steps,
          locale,
          labels,
          triggerLabel: (type) => tTriggers(type),
          hasTrigger: (type) => tTriggers.has(type),
          actionLabel: (type) => tActions(type),
          hasAction: (type) => tActions.has(type),
          appTitle: (type) => tBuilder(type === 'app_email' ? 'appEmail' : 'appWebhook'),
          appSubtitle: tBuilder('nodeApp'),
          conditionTitle: tBuilder('nodeCondition'),
          endTitle: (type) => tBuilder(type === 'stay_in_cs' ? 'endStayInCs' : 'endStop'),
          endSubtitle: tBuilder('nodeEnd'),
          name: edit.name?.trim() || '',
          description: edit.description?.trim() || '',
        })
      : null;
    if (steps && !built) return;
    const workflowId = latestIdRef.current;
    const seq = ++applySeqRef.current;
    setAiApplying(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    if (seq !== applySeqRef.current) return;
    if (latestIdRef.current !== workflowId) {
      setAiApplying(false);
      return;
    }
    const current = draftRef.current;
    if (current) history.push({ nodes: current.nodes, edges: current.edges }, { force: true });
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const nodes = applyFieldUpdates(built?.nodes ?? currentDraft.nodes, edit.updates);
      return {
        ...currentDraft,
        name: edit.name?.trim() || currentDraft.name || built?.name || '',
        description: edit.description?.trim() || currentDraft.description || built?.description || '',
        type: built?.type ?? currentDraft.type,
        nodes,
        edges: built?.edges ?? currentDraft.edges,
      };
    });
    setSelectedNodeId(null);
    setNameError(null);
    setFormError(null);
    setAiApplying(false);
  }, [history, locale, tActions, tBuilder, tTriggers]);

  useEffect(() => {
    if (planFlag !== '1' || loading || !draft || appliedPlanRef.current) return;
    appliedPlanRef.current = true;
    const edit = takeCopilotReviewPlan();
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('plan');
    const query = next.toString();
    router.replace(query ? `/automation/details?${query}` : '/automation/details');
    if (edit) void applyWorkflowPlan(edit);
  }, [planFlag, loading, draft, applyWorkflowPlan, router, searchParams]);

  useEffect(() => {
    if (!recipeId || loading || !draft || appliedRecipeRef.current === recipeId) return;
    appliedRecipeRef.current = recipeId;
    void applyWorkflowRecipe(recipeId);
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('recipe');
    const query = next.toString();
    router.replace(query ? `/automation/details?${query}` : '/automation/details');
  }, [recipeId, loading, draft, applyWorkflowRecipe, router, searchParams]);

  useEffect(() => {
    if (!user?.id || !id) return;
    const requestedId = id;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await fetchGraphQL<{ automationRuns: AutomationRun[] }>(RUNS_QUERY, {
          id: requestedId,
        });
        if (cancelled || latestIdRef.current !== requestedId) return;
        setRuns(data.automationRuns ?? []);
      } catch {
        // Keep the last known history if a poll fails.
      }
    };
    const timer = window.setInterval(() => {
      void tick();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.id, id]);

  const checkpointHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    history.push({ nodes: current.nodes, edges: current.edges }, { force: true });
  }, [history]);

  const lastDataHistoryAtRef = useRef(0);

  const patch = (next: Partial<WorkflowDraft>) => {
    if (next.name !== undefined) setNameError(null);
    const prev = draftRef.current;
    if (
      prev &&
      (next.nodes || next.edges) &&
      isStructuralCanvasChange(
        { nodes: prev.nodes, edges: prev.edges },
        { nodes: next.nodes, edges: next.edges },
      )
    ) {
      history.push({ nodes: prev.nodes, edges: prev.edges });
    }
    setDraft((current) => (current ? { ...current, ...next } : current));
  };

  const updateNode = (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => {
    const prev = draftRef.current;
    if (prev) {
      const now = Date.now();
      if (now - lastDataHistoryAtRef.current > 600) {
        history.push({ nodes: prev.nodes, edges: prev.edges });
        lastDataHistoryAtRef.current = now;
      }
    }
    setDraft((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n,
            ),
          }
        : current,
    );
  };

  const deleteNode = (nodeId: string) => {
    const prev = draftRef.current;
    if (prev) history.push({ nodes: prev.nodes, edges: prev.edges });
    setDraft((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.filter((n) => n.id !== nodeId),
            edges: current.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          }
        : current,
    );
    setSelectedNodeId((current) => (current === nodeId ? null : current));
  };

  const disconnectNode = (nodeId: string) => {
    const prev = draftRef.current;
    if (prev) history.push({ nodes: prev.nodes, edges: prev.edges });
    setDraft((current) =>
      current
        ? {
            ...current,
            edges: current.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          }
        : current,
    );
  };

  const undo = useCallback(() => {
    history.undo((snapshot) => {
      setDraft((current) =>
        current ? { ...current, nodes: snapshot.nodes, edges: snapshot.edges } : current,
      );
      setSelectedNodeId((current) =>
        current && snapshot.nodes.some((n) => n.id === current) ? current : null,
      );
    });
    lastDataHistoryAtRef.current = 0;
  }, [history]);

  const save = async (
    statusOverride?: 'draft' | 'paused' | 'active',
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
      if (!flat.hasTrigger || !flat.triggerType) {
        setFormError(tBuilder('triggerRequired'));
        return false;
      }
      if (
        hasAssignDriverWithoutDriver({
          actionType: flat.actionType,
          actionConfig: flat.actionConfig,
          nodes: draft.nodes,
        })
      ) {
        setFormError(
          tBuilder.has('assignDriverRequiresDriver')
            ? tBuilder('assignDriverRequiresDriver')
            : ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE,
        );
        return false;
      }
      await fetchGraphQL(UPDATE_MUTATION, {
        id,
        name: draft.name.trim(),
        description: draft.description,
        type: draft.type,
        status: statusOverride ?? draft.status,
        triggerType: flat.triggerType,
        triggerConfig: flat.triggerConfig,
        agentConfig: packAgentConfig(flat.agentNote, draft.nodes, draft.edges),
        actionType: flat.actionType || undefined,
        actionConfig: flat.actionConfig,
        whatsappPhone: flat.whatsappPhone || null,
        gmailEmail: flat.gmailEmail || null,
      });
      if (statusOverride) {
        setDraft((prev) => (prev ? { ...prev, status: statusOverride } : prev));
      }
      requestGlanceRefresh();
      // Keep run history as-is. Save draft / activate must not create or reload run rows.
      await load({ silent: true, preserveRuns: true });
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
      const saved = await save(undefined, { manageSaving: false });
      if (!saved) return;
      const data = await fetchGraphQL<{ testAutomationWorkflow: AutomationRun }>(TEST_MUTATION, {
        id,
        locale,
      });
      setRuns((prev) => [data.testAutomationWorkflow, ...prev]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tBuilder('testFailed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRun = async (runId: string) => {
    if (!user?.id) return;
    setClearingRuns(true);
    try {
      await fetchGraphQL<{ deleteAutomationRun: { success: boolean } }>(DELETE_RUN_MUTATION, {
        id: runId,
      }).then((data) => {
        if (data.deleteAutomationRun.success) {
          setRuns((prev) => prev.filter((run) => run.id !== runId));
        }
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tBuilder('saveFailed'));
    } finally {
      setClearingRuns(false);
    }
  };

  const clearAllRuns = async () => {
    if (!user?.id || !id) return;
    setClearingRuns(true);
    try {
      await fetchGraphQL<{ clearAutomationRuns: { success: boolean } }>(CLEAR_RUNS_MUTATION, {
        workflowId: id,
      });
      const data = await fetchGraphQL<{ automationRuns: AutomationRun[] }>(RUNS_QUERY, { id });
      setRuns(data.automationRuns ?? []);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tBuilder('saveFailed'));
    } finally {
      setClearingRuns(false);
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
      aiAutomationId={id}
      aiApplying={aiApplying}
      onApplyWorkflowRecipeAction={(recipeId) => void applyWorkflowRecipe(recipeId)}
      onApplyWorkflowPlanAction={(steps) => void applyWorkflowPlan(steps)}
      canvasSteps={draft ? planFromCanvasNodes(draft.nodes, draft.edges) : null}
      initialConversationId={linkedChatId}
      onDismissStepDetailsAction={() => setSelectedNodeId(null)}
      closeAskAiRef={closeAskAiRef}
      saving={saving}
      showTestRun
      onSaveDraftAction={() => save('draft')}
      onPauseAction={() => save('paused')}
      onActivateAction={() => save('active')}
      onTestRunAction={() => testRun()}
      onUndoAction={undo}
      canUndo={history.canUndo}
      canvas={
        <WorkflowCanvas
          workflowType={draft.type}
          nodes={draft.nodes}
          edges={draft.edges}
          selectedNodeId={selectedNodeId}
          onNodesChangeAction={(nodes) => patch({ nodes })}
          onEdgesChangeAction={(edges) => patch({ edges })}
          onSelectNodeAction={(nodeId) => {
            setSelectedNodeId(nodeId);
            if (nodeId) closeAskAiRef.current?.();
          }}
          onHistoryCheckpointAction={checkpointHistory}
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
          onDeleteRunAction={(runId) => void deleteRun(runId)}
          onClearAllRunsAction={() => void clearAllRuns()}
          clearingRuns={clearingRuns}
          workflowId={id ?? undefined}
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
