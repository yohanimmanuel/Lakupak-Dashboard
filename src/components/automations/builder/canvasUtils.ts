import type { WorkflowType } from '../automationTypes';
import { getDefaultAction, getDefaultTrigger } from '@/lib/automations/catalog';
import type { WorkflowFlowEdge, WorkflowFlowNode, WorkflowNodeData } from './canvasTypes';
import { CANVAS_STORAGE_KEY, DEFAULT_EDGE_TYPE, newNodeId } from './canvasTypes';

export function createDefaultCanvas(
  type: WorkflowType,
  labels: {
    triggerTitle: string;
    triggerSubtitle: string;
    agentTitle: string;
    agentSubtitle: string;
    actionTitle: string;
    actionSubtitle: string;
  },
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const trigger = getDefaultTrigger(type);
  const action = getDefaultAction(type);
  const triggerId = newNodeId('trigger');
  const agentId = newNodeId('agent');
  const actionId = newNodeId('action');

  const nodes: WorkflowFlowNode[] = [
    {
      id: triggerId,
      type: 'workflow',
      position: { x: 280, y: 40 },
      data: {
        kind: 'trigger',
        catalogType: trigger.triggerType,
        title: labels.triggerTitle,
        subtitle: labels.triggerSubtitle,
        config: trigger.triggerConfig,
      },
    },
    {
      id: agentId,
      type: 'workflow',
      position: { x: 280, y: 200 },
      data: {
        kind: 'agent',
        catalogType: 'laku_agent',
        title: labels.agentTitle,
        subtitle: labels.agentSubtitle,
        config: { note: '' },
      },
    },
    {
      id: actionId,
      type: 'workflow',
      position: { x: 280, y: 360 },
      data: {
        kind: 'action',
        catalogType: action.actionType,
        title: labels.actionTitle,
        subtitle: labels.actionSubtitle,
        config: action.actionConfig,
      },
    },
  ];

  const edges: WorkflowFlowEdge[] = [
    {
      id: `e_${triggerId}_${agentId}`,
      source: triggerId,
      target: agentId,
      sourceHandle: 'source-bottom',
      targetHandle: 'source-top',
      type: DEFAULT_EDGE_TYPE,
      animated: true,
    },
    {
      id: `e_${agentId}_${actionId}`,
      source: agentId,
      target: actionId,
      sourceHandle: 'source-bottom',
      targetHandle: 'source-top',
      type: DEFAULT_EDGE_TYPE,
      animated: true,
    },
  ];

  return { nodes, edges };
}

export function packAgentConfig(
  note: string,
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
): Record<string, unknown> {
  return {
    note,
    [CANVAS_STORAGE_KEY]: {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        label: typeof e.label === 'string' ? e.label : null,
      })),
    },
  };
}

export function unpackCanvasFromAgentConfig(
  agentConfig: Record<string, unknown> | null | undefined,
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[]; note: string } | null {
  if (!agentConfig || typeof agentConfig !== 'object') return null;
  const note = String(agentConfig.note ?? '');
  const raw = agentConfig[CANVAS_STORAGE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const canvas = raw as {
    nodes?: Array<{
      id: string;
      type?: string;
      position: { x: number; y: number };
      data: WorkflowNodeData;
    }>;
    edges?: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
      label?: string | null;
    }>;
  };
  if (!Array.isArray(canvas.nodes) || canvas.nodes.length === 0) return null;

  return {
    note,
    nodes: canvas.nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'workflow',
      position: n.position,
      data: n.data,
    })),
    edges: (canvas.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      label: e.label ?? undefined,
      type: DEFAULT_EDGE_TYPE,
      animated: true,
      labelStyle: e.label
        ? { fill: '#334155', fontSize: 11, fontWeight: 600 }
        : undefined,
      labelBgStyle: e.label ? { fill: '#ffffff' } : undefined,
      labelBgPadding: e.label ? ([4, 6] as [number, number]) : undefined,
    })),
  };
}

/** Derive flat API fields from the graph (first of each kind). */
export function deriveFlatFieldsFromCanvas(nodes: WorkflowFlowNode[]) {
  const trigger = nodes.find((n) => n.data.kind === 'trigger');
  const action = nodes.find((n) => n.data.kind === 'action');
  const agent = nodes.find((n) => n.data.kind === 'agent');
  return {
    triggerType: trigger?.data.catalogType ?? 'stock_below',
    triggerConfig: trigger?.data.config ?? {},
    actionType: action?.data.catalogType ?? 'notify_dashboard',
    actionConfig: action?.data.config ?? {},
    agentNote: String(agent?.data.config?.note ?? ''),
  };
}
