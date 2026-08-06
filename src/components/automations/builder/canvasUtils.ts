import type { WorkflowType } from '../automationTypes';
import {
  getDefaultAction,
  getDefaultTrigger,
  migrateOrderPaidTriggerConfig,
} from '@/lib/automations/catalog';
import { defaultLakuAgentConfig } from '@/lib/automations/agentModels';
import type { WorkflowFlowEdge, WorkflowFlowNode, WorkflowNodeData } from './canvasTypes';
import {
  CANVAS_STORAGE_KEY,
  DEFAULT_EDGE_TYPE,
  newNodeId,
  normalizeConditionConfig,
} from './canvasTypes';

function normalizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
  if (data.kind === 'condition') {
    return {
      ...data,
      config: normalizeConditionConfig(data.config),
    };
  }
  if (data.kind === 'trigger' && data.catalogType === 'order_paid') {
    return {
      ...data,
      config: migrateOrderPaidTriggerConfig(data.config),
    };
  }
  return data;
}

type CanvasLabels = {
  triggerTitle: string;
  triggerSubtitle: string;
  agentTitle: string;
  agentSubtitle: string;
  actionTitle: string;
  actionSubtitle: string;
};

/** New workflows start with only the Laku AI node — users add triggers/actions from the canvas. */
export function createDefaultCanvas(
  _type: WorkflowType,
  labels: CanvasLabels,
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const agentId = newNodeId('agent');

  return {
    nodes: [
      {
        id: agentId,
        type: 'workflow',
        position: { x: 280, y: 200 },
        data: {
          kind: 'agent',
          catalogType: 'laku_agent',
          name: '',
          title: labels.agentTitle,
          subtitle: labels.agentSubtitle,
          config: defaultLakuAgentConfig(),
        },
      },
    ],
    edges: [],
  };
}

/** Rebuild a simple linear canvas for older workflows that only stored flat trigger/action fields. */
export function createLegacyFlatCanvas(
  type: WorkflowType,
  labels: CanvasLabels,
  flat?: {
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    actionType?: string;
    actionConfig?: Record<string, unknown>;
    agentNote?: string;
  },
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const trigger = getDefaultTrigger(type);
  const action = getDefaultAction(type);
  const triggerId = newNodeId('trigger');
  const agentId = newNodeId('agent');
  const actionId = newNodeId('action');
  const triggerType = flat?.triggerType ?? trigger.triggerType;
  const triggerConfigRaw = flat?.triggerConfig ?? trigger.triggerConfig;
  const triggerConfig =
    triggerType === 'order_paid'
      ? migrateOrderPaidTriggerConfig(triggerConfigRaw)
      : triggerConfigRaw;

  const nodes: WorkflowFlowNode[] = [
    {
      id: triggerId,
      type: 'workflow',
      position: { x: 280, y: 40 },
      data: {
        kind: 'trigger',
        catalogType: triggerType,
        name: '',
        title: labels.triggerSubtitle,
        subtitle: labels.triggerTitle,
        config: triggerConfig,
      },
    },
    {
      id: agentId,
      type: 'workflow',
      position: { x: 280, y: 200 },
      data: {
        kind: 'agent',
        catalogType: 'laku_agent',
        name: '',
        title: labels.agentTitle,
        subtitle: labels.agentSubtitle,
        config: defaultLakuAgentConfig(flat?.agentNote ?? ''),
      },
    },
    {
      id: actionId,
      type: 'workflow',
      position: { x: 280, y: 360 },
      data: {
        kind: 'action',
        catalogType: flat?.actionType ?? action.actionType,
        name: '',
        title: labels.actionSubtitle,
        subtitle: labels.actionTitle,
        config: flat?.actionConfig ?? action.actionConfig,
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
        data: normalizeNodeData(n.data),
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
      data: normalizeNodeData({
        ...n.data,
        name: typeof n.data?.name === 'string' ? n.data.name : '',
      }),
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
  const whatsappApp = nodes.find(
    (n) => n.data.kind === 'app' && n.data.catalogType === 'app_webhook',
  );
  const gmailApp = nodes.find(
    (n) => n.data.kind === 'app' && n.data.catalogType === 'app_email',
  );
  return {
    triggerType: String(trigger?.data.catalogType ?? '').trim(),
    triggerConfig:
      trigger?.data.catalogType === 'order_paid'
        ? migrateOrderPaidTriggerConfig(trigger.data.config)
        : (trigger?.data.config ?? {}),
    actionType: String(action?.data.catalogType ?? '').trim(),
    actionConfig: action?.data.config ?? {},
    agentNote: String(agent?.data.config?.note ?? ''),
    whatsappPhone: String(whatsappApp?.data.config?.phone ?? '').trim(),
    gmailEmail: String(gmailApp?.data.config?.email ?? '').trim(),
    hasTrigger: Boolean(trigger),
    hasAction: Boolean(action),
  };
}

/** Fill app channel fields from persisted workflow columns when canvas config is empty. */
export function hydrateAppChannelConfig(
  nodes: WorkflowFlowNode[],
  channels?: { whatsappPhone?: string | null; gmailEmail?: string | null },
): WorkflowFlowNode[] {
  if (!channels) return nodes;
  const phone = String(channels.whatsappPhone ?? '').trim();
  const email = String(channels.gmailEmail ?? '').trim();
  if (!phone && !email) return nodes;

  return nodes.map((node) => {
    if (node.data.kind !== 'app') return node;
    if (node.data.catalogType === 'app_webhook' && phone && !String(node.data.config?.phone ?? '').trim()) {
      return {
        ...node,
        data: {
          ...node.data,
          config: { ...node.data.config, phone },
        },
      };
    }
    if (node.data.catalogType === 'app_email' && email && !String(node.data.config?.email ?? '').trim()) {
      return {
        ...node,
        data: {
          ...node.data,
          config: { ...node.data.config, email },
        },
      };
    }
    return node;
  });
}
