import type { Edge, Node } from '@xyflow/react';
import type { BuilderNodeKind } from '../automationTypes';

export type FlowNodeKind = BuilderNodeKind | 'app' | 'condition';

export type WorkflowNodeData = {
  kind: FlowNodeKind;
  catalogType: string;
  /** Custom display name shown on the canvas card. */
  name: string;
  title: string;
  subtitle: string;
  config: Record<string, unknown>;
  onRequestDelete?: () => void;
  onRequestDisconnect?: () => void;
};

export type WorkflowFlowNode = Node<WorkflowNodeData>;
export type WorkflowFlowEdge = Edge;

export type CanvasPickerCategory = 'trigger' | 'action' | 'agent' | 'app' | 'condition';

export type PendingConnection = {
  sourceId: string;
  sourceHandle: string | null;
  flowX: number;
  flowY: number;
  screenX: number;
  screenY: number;
};

export const CANVAS_STORAGE_KEY = '__canvas';
export const DEFAULT_EDGE_TYPE = 'default';
export const BRANCH_YES = 'Yes';
export const BRANCH_NO = 'No';

export function newNodeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isYesBranch(label: unknown) {
  return String(label ?? '') === BRANCH_YES;
}

export function isNoBranch(label: unknown) {
  return String(label ?? '') === BRANCH_NO;
}

/** Pick next Yes/No label for a new edge leaving a condition node. */
export function nextConditionBranchLabel(
  sourceNode: WorkflowFlowNode,
  edges: WorkflowFlowEdge[],
): string {
  const outgoing = edges.filter((e) => e.source === sourceNode.id);
  const used = new Set(outgoing.map((e) => String(e.label ?? '')));
  if (!used.has(BRANCH_YES)) return BRANCH_YES;
  if (!used.has(BRANCH_NO)) return BRANCH_NO;
  return BRANCH_YES;
}

export function withBranchLabelStyle(label: string | undefined) {
  if (!label) return {};
  const yes = isYesBranch(label);
  const no = isNoBranch(label);
  return {
    label,
    labelStyle: {
      fill: yes ? '#047857' : no ? '#be123c' : '#334155',
      fontSize: 11,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: yes ? '#ecfdf5' : no ? '#fff1f2' : '#ffffff',
    },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 6,
  };
}


