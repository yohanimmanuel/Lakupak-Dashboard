'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  ASSIGN_DRIVER_REQUIRES_DRIVER_MESSAGE,
  hasAssignDriverWithoutDriver,
} from '@/lib/automations/catalog';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

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
  const { tBuilder } = useAutomationTranslations();

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

  const patch = (next: Partial<WorkflowDraft>) => {
    if (next.name !== undefined) setNameError(null);
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const updateNode = (nodeId: string, dataPatch: Partial<WorkflowFlowNode['data']>) => {
    setDraft((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n,
      ),
    }));
  };

  const deleteNode = (nodeId: string) => {
    setDraft((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  };

  const disconnectNode = (nodeId: string) => {
    setDraft((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
  };

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
          actionType: flat.actionType,
          actionConfig: flat.actionConfig,
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

  return (
    <WorkflowBuilderShell
      title={draft.name || tBuilder('untitled')}
      status={draft.status}
      saving={saving}
      onSaveDraftAction={() => save('draft')}
      onActivateAction={() => void save('active')}
      canvas={
        <WorkflowCanvas
          workflowType={draft.type}
          nodes={draft.nodes}
          edges={draft.edges}
          selectedNodeId={selectedNodeId}
          onNodesChangeAction={(nodes: WorkflowFlowNode[]) => patch({ nodes })}
          onEdgesChangeAction={(edges: WorkflowFlowEdge[]) => patch({ edges })}
          onSelectNodeAction={setSelectedNodeId}
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
