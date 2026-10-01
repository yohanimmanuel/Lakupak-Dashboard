'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { WorkflowBuilderShell } from '@/components/automations/builder/WorkflowBuilderShell';
import { WorkflowCanvas } from '@/components/automations/builder/WorkflowCanvas';
import {
  WorkflowDetailsPanel,
  StepDetailsPanel,
  type WorkflowDraft,
} from '@/components/automations/builder/WorkflowInspector';
import { createDefaultCanvas, deriveFlatFieldsFromCanvas, packAgentConfig } from '@/components/automations/builder/canvasUtils';
import type { WorkflowFlowEdge, WorkflowFlowNode } from '@/components/automations/builder/canvasTypes';
import {
  isStructuralCanvasChange,
  useCanvasHistory,
} from '@/components/automations/builder/useCanvasHistory';
import {
  ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE,
  hasAssignDriverWithoutDriver,
} from '@/lib/automations/catalog';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { buildCopilotDraft } from '@/components/automations/buildCopilotDraft';
import { copilotRecipeById } from '@/lib/automations/copilotRecipes';

const CREATE_MUTATION = `
  mutation CreateAutomationWorkflow(
    $name: String!
    $description: String
    $type: String!
    $status: String
    $triggerType: String
    $triggerConfig: JSONObject
    $agentConfig: JSONObject
    $actionType: String
    $actionConfig: JSONObject
    $whatsappPhone: String
    $gmailEmail: String
  ) {
    createAutomationWorkflow(
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
    }
  }
`;

function buildInitialDraft(
  labels: Parameters<typeof createDefaultCanvas>[1],
): WorkflowDraft {
  const type = 'product_offers';
  const canvas = createDefaultCanvas(type, labels);
  return {
    name: '',
    description: '',
    type,
    status: 'draft',
    nodes: canvas.nodes,
    edges: canvas.edges,
  };
}

export default function NewAutomationPage() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const { tBuilder, tTriggers, tActions } = useAutomationTranslations();
  const locale = useLocale();
  const tCopilot = useTranslations('dashboard.automation.copilot');
  const recipeBootstrapped = useRef(false);

  const labels = useMemo(
    () => ({
      triggerTitle: tBuilder('nodeTrigger'),
      triggerSubtitle: tBuilder('nodeTrigger'),
      agentTitle: tBuilder('nodeAgent'),
      agentSubtitle: tBuilder('nodeAgent'),
      actionTitle: tBuilder('nodeAction'),
      actionSubtitle: tBuilder('nodeAction'),
    }),
    [tBuilder],
  );

  const [draft, setDraft] = useState<WorkflowDraft>(() => buildInitialDraft(labels));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => draft.nodes[0]?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const history = useCanvasHistory();

  const checkpointHistory = useCallback(() => {
    const current = draftRef.current;
    history.push({ nodes: current.nodes, edges: current.edges }, { force: true });
  }, [history]);

  const lastDataHistoryAtRef = useRef(0);

  const patch = (next: Partial<WorkflowDraft>) => {
    if (next.name !== undefined) setNameError(null);
    const prev = draftRef.current;
    if (
      (next.nodes || next.edges) &&
      isStructuralCanvasChange(
        { nodes: prev.nodes, edges: prev.edges },
        { nodes: next.nodes, edges: next.edges },
      )
    ) {
      history.push({ nodes: prev.nodes, edges: prev.edges });
    }
    setDraft((current) => ({ ...current, ...next }));
  };

  const updateNode = (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => {
    const prev = draftRef.current;
    const now = Date.now();
    if (now - lastDataHistoryAtRef.current > 600) {
      history.push({ nodes: prev.nodes, edges: prev.edges });
      lastDataHistoryAtRef.current = now;
    }
    setDraft((current) => ({
      ...current,
      nodes: current.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n,
      ),
    }));
  };

  const deleteNode = (nodeId: string) => {
    const prev = draftRef.current;
    history.push({ nodes: prev.nodes, edges: prev.edges });
    setDraft((current) => ({
      ...current,
      nodes: current.nodes.filter((n) => n.id !== nodeId),
      edges: current.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    setSelectedNodeId((current) => (current === nodeId ? null : current));
  };

  const disconnectNode = (nodeId: string) => {
    const prev = draftRef.current;
    history.push({ nodes: prev.nodes, edges: prev.edges });
    setDraft((current) => ({
      ...current,
      edges: current.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
  };

  const undo = useCallback(() => {
    history.undo((snapshot) => {
      setDraft((current) => ({ ...current, nodes: snapshot.nodes, edges: snapshot.edges }));
      setSelectedNodeId((current) =>
        current && snapshot.nodes.some((n) => n.id === current) ? current : null,
      );
    });
    lastDataHistoryAtRef.current = 0;
  }, [history]);

  const save = async (status: 'draft' | 'active'): Promise<boolean> => {
    if (!user?.id) return false;
    if (!draft.name.trim()) {
      setNameError(tBuilder('nameRequired'));
      setFormError(null);
      return false;
    }
    setSaving(true);
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
      const result = await fetchGraphQL<{ createAutomationWorkflow: { id: string } }>(
        CREATE_MUTATION,
        {
          name: draft.name.trim(),
          description: draft.description,
          type: draft.type,
          status,
          triggerType: flat.triggerType,
          triggerConfig: flat.triggerConfig,
          agentConfig: packAgentConfig(flat.agentNote, draft.nodes, draft.edges),
          actionType: flat.actionType || undefined,
          actionConfig: flat.actionConfig,
          whatsappPhone: flat.whatsappPhone || null,
          gmailEmail: flat.gmailEmail || null,
        },
      );
      if (status === 'draft') {
        window.location.href = `/automation/details?id=${result.createAutomationWorkflow.id}`;
        return true;
      }
      router.push(`/automation/details?id=${result.createAutomationWorkflow.id}`);
      return true;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tBuilder('saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (recipeBootstrapped.current) return;
    const recipeId = new URLSearchParams(window.location.search).get('recipe');
    if (!recipeId) return;
    const recipe = copilotRecipeById(recipeId);
    if (!recipe || recipe.kind !== 'workflow') return;
    recipeBootstrapped.current = true;
    const templateKey = `recipes.${recipe.id}.template`;
    const built = buildCopilotDraft({
      recipe,
      locale,
      labels,
      triggerLabel: tTriggers.has(recipe.triggerType) ? tTriggers(recipe.triggerType) : labels.triggerSubtitle,
      actionLabels: recipe.actions.map((action) =>
        tActions.has(action.type) ? tActions(action.type) : labels.actionTitle,
      ),
      note: tCopilot(`recipes.${recipe.id}.logic`),
      name: tCopilot(`recipes.${recipe.id}.name`),
      description: tCopilot(`recipes.${recipe.id}.summary`),
      messageTemplate: tCopilot.has(templateKey) ? tCopilot(templateKey) : undefined,
    });
    const current = draftRef.current;
    history.push({ nodes: current.nodes, edges: current.edges }, { force: true });
    setDraft({
      name: built.name.trim(),
      description: built.description,
      type: built.type,
      status: current.status,
      nodes: built.nodes,
      edges: built.edges,
    });
    setSelectedNodeId(built.nodes[0]?.id ?? null);
    setNameError(null);
    setFormError(null);
    window.history.replaceState(null, '', '/automation/new');
  }, [history, labels, locale, tActions, tCopilot, tTriggers]);

  return (
    <WorkflowBuilderShell
      title={draft.name || tBuilder('untitled')}
      status={draft.status}
      saving={saving}
      onSaveDraftAction={() => save('draft')}
      onActivateAction={() => save('active')}
      onUndoAction={undo}
      canUndo={history.canUndo}
      canvas={
        <WorkflowCanvas
          workflowType={draft.type}
          nodes={draft.nodes}
          edges={draft.edges}
          selectedNodeId={selectedNodeId}
          onNodesChangeAction={(nodes: WorkflowFlowNode[]) => patch({ nodes })}
          onEdgesChangeAction={(edges: WorkflowFlowEdge[]) => patch({ edges })}
          onSelectNodeAction={setSelectedNodeId}
          onHistoryCheckpointAction={checkpointHistory}
        />
      }
      leftPanel={
        <WorkflowDetailsPanel
          draft={draft}
          onChangeAction={patch}
          nameError={nameError}
          formError={formError}
        />
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
        />
      }
    />
  );
}
