'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  addEdge,
  useReactFlow,
  useViewport,
  useStore,
  ReactFlowProvider,
  Panel,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  MarkerType,
  SelectionMode,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Minus, Plus, Trash2, Unplug } from 'lucide-react';

import type { WorkflowType } from '../automationTypes';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { WorkflowFlowNodeView, CanvasNodeActionsProvider } from './WorkflowFlowNode';
import { NodeAddMenu, type NodePickerChoice } from './NodeAddMenu';
import {
  BRANCH_NO,
  BRANCH_YES,
  DEFAULT_EDGE_TYPE,
  isNoBranch,
  isYesBranch,
  nextConditionBranchLabel,
  withBranchLabelStyle,
  type PendingConnection,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from './canvasTypes';
import { newNodeId } from './canvasTypes';

const PENDING_NODE_ID = '__pending_drop__';
const PENDING_EDGE_ID = '__pending_edge__';

function PendingDropAnchor() {
  return (
    <div className="pointer-events-none relative h-3 w-3">
      <Handle
        type="target"
        position={Position.Top}
        id="pending-target"
        className="!pointer-events-none !h-3 !w-3 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0"
        style={{ top: 6, left: 6, transform: 'translate(-50%, -50%)' }}
      />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0a61d7] shadow-[0_0_0_4px_rgba(10,97,215,0.18)]" />
    </div>
  );
}

const nodeTypes = {
  workflow: WorkflowFlowNodeView,
  pendingDrop: PendingDropAnchor,
};

const edgeDefaults = {
  type: DEFAULT_EDGE_TYPE,
  animated: true,
  style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' },
};

function CanvasZoomControl() {
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const minZoom = useStore((s) => s.minZoom);
  const maxZoom = useStore((s) => s.maxZoom);
  const zoomPercent = Math.round(zoom * 100);
  const [draft, setDraft] = useState(String(zoomPercent));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(zoomPercent));
  }, [zoomPercent, editing]);

  const commitZoom = () => {
    const parsed = Number.parseInt(draft.replace(/%/g, '').trim(), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(zoomPercent));
      setEditing(false);
      return;
    }
    const min = Math.round(minZoom * 100);
    const max = Math.round(maxZoom * 100);
    const clamped = Math.min(max, Math.max(min, parsed));
    zoomTo(clamped / 100, { duration: 160 });
    setDraft(String(clamped));
    setEditing(false);
  };

  return (
    <Panel position="bottom-left" className="!m-3 !z-20">
      <div
        className="nopan nodrag nowheel flex h-9 items-stretch overflow-hidden rounded-lg border border-[#e6e6e6] bg-white text-gray-600"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomOut({ duration: 160 })}
          className="flex w-9 items-center justify-center transition-colors hover:bg-gray-50"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <label className="flex min-w-[3.75rem] items-center justify-center border-x border-[#e6e6e6] px-1">
          <span className="sr-only">Zoom percent</span>
          <input
            type="text"
            inputMode="numeric"
            value={editing ? draft : `${zoomPercent}%`}
            onFocus={() => {
              setEditing(true);
              setDraft(String(zoomPercent));
            }}
            onChange={(e) => {
              setEditing(true);
              setDraft(e.target.value.replace(/[^\d]/g, ''));
            }}
            onBlur={commitZoom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                setDraft(String(zoomPercent));
                setEditing(false);
                e.currentTarget.blur();
              }
              e.stopPropagation();
            }}
            className="w-12 bg-transparent text-center text-xs font-medium tabular-nums text-gray-600 outline-none"
            aria-label="Zoom percent"
          />
        </label>
        <button
          type="button"
          onClick={() => zoomIn({ duration: 160 })}
          className="flex w-9 items-center justify-center transition-colors hover:bg-gray-50"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </Panel>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function WorkflowCanvasInner({
  workflowType,
  nodes,
  edges,
  selectedNodeId,
  onNodesChangeAction,
  onEdgesChangeAction,
  onSelectNodeAction,
}: {
  workflowType: WorkflowType;
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  selectedNodeId: string | null;
  onNodesChangeAction: (nodes: WorkflowFlowNode[]) => void;
  onEdgesChangeAction: (edges: WorkflowFlowEdge[]) => void;
  onSelectNodeAction: (nodeId: string | null) => void;
}) {
  const { tBuilder } = useAutomationTranslations();
  const { screenToFlowPosition } = useReactFlow();
  const connectingFrom = useRef<{ nodeId: string; handleId: string | null } | null>(null);
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  /** Derived from RF-controlled `node.selected` (via onNodesChange). Avoid parallel selection state. */
  const selectedNodeIds = useMemo(
    () => nodes.filter((n) => n.selected).map((n) => n.id),
    [nodes],
  );
  const selectedEdgeId = useMemo(
    () => edges.find((e) => e.selected)?.id ?? null,
    [edges],
  );
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;

  const clearNodeSelection = useCallback(() => {
    if (!nodes.some((n) => n.selected)) return;
    onNodesChangeAction(nodes.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, [nodes, onNodesChangeAction]);

  const clearEdgeSelection = useCallback(() => {
    if (!edges.some((e) => e.selected)) return;
    onEdgesChangeAction(edges.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, [edges, onEdgesChangeAction]);

  const deleteNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      const remove = new Set(nodeIds);
      onNodesChangeAction(nodes.filter((n) => !remove.has(n.id)));
      onEdgesChangeAction(
        edges.filter((e) => !remove.has(e.source) && !remove.has(e.target)),
      );
      if (selectedNodeId && remove.has(selectedNodeId)) onSelectNodeAction(null);
      setPending((prev) =>
        prev?.sourceId && remove.has(prev.sourceId) ? null : prev,
      );
    },
    [nodes, edges, selectedNodeId, onNodesChangeAction, onEdgesChangeAction, onSelectNodeAction],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      deleteNodes([nodeId]);
    },
    [deleteNodes],
  );

  const disconnectNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      const targets = new Set(nodeIds);
      onEdgesChangeAction(
        edges.filter((e) => !targets.has(e.source) && !targets.has(e.target)),
      );
    },
    [edges, onEdgesChangeAction],
  );

  const disconnectNode = useCallback(
    (nodeId: string) => {
      disconnectNodes([nodeId]);
    },
    [disconnectNodes],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      onEdgesChangeAction(edges.filter((e) => e.id !== edgeId));
    },
    [edges, onEdgesChangeAction],
  );

  const setConditionEdgeBranch = useCallback(
    (edgeId: string, nextLabel: typeof BRANCH_YES | typeof BRANCH_NO) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode || sourceNode.data.kind !== 'condition') return;

      const opposite = nextLabel === BRANCH_YES ? BRANCH_NO : BRANCH_YES;

      onEdgesChangeAction(
        edges.map((e) => {
          if (e.id === edgeId) {
            return { ...e, ...withBranchLabelStyle(nextLabel) };
          }
          if (
            e.source === edge.source &&
            e.id !== edgeId &&
            String(e.label ?? '') === nextLabel
          ) {
            return { ...e, ...withBranchLabelStyle(opposite) };
          }
          return e;
        }),
      );
    },
    [edges, nodes, onEdgesChangeAction],
  );

  const deleteNodeRef = useRef(deleteNode);
  const disconnectNodeRef = useRef(disconnectNode);
  deleteNodeRef.current = deleteNode;
  disconnectNodeRef.current = disconnectNode;

  const onRequestDeleteNode = useCallback((nodeId: string) => {
    deleteNodeRef.current(nodeId);
  }, []);
  const onRequestDisconnectNode = useCallback((nodeId: string) => {
    disconnectNodeRef.current(nodeId);
  }, []);

  const selectedConditionEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const source = nodes.find((n) => n.id === edge.source);
    if (!source || source.data.kind !== 'condition') return null;
    return { edge, source };
  }, [selectedEdgeId, edges, nodes]);

  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const selected = Boolean(e.selected);
        const branchStyle = withBranchLabelStyle(
          typeof e.label === 'string' ? e.label : undefined,
        );
        const yes = isYesBranch(e.label);
        const no = isNoBranch(e.label);
        const stroke = selected
          ? '#0a61d7'
          : yes
            ? '#10b981'
            : no
              ? '#f43f5e'
              : '#94a3b8';
        return {
          ...e,
          ...branchStyle,
          selected,
          style: {
            ...edgeDefaults.style,
            stroke,
            strokeWidth: selected ? 2.5 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: stroke,
          },
        };
      }),
    [edges],
  );

  const displayNodes = useMemo(() => {
    if (!pending) return nodes;
    return [
      ...nodes,
      {
        id: PENDING_NODE_ID,
        type: 'pendingDrop',
        position: { x: pending.flowX - 6, y: pending.flowY - 6 },
        data: {
          kind: 'action' as const,
          catalogType: '',
          name: '',
          title: '',
          subtitle: '',
          config: {},
        },
        draggable: false,
        selectable: false,
        focusable: false,
        connectable: false,
      } satisfies WorkflowFlowNode,
    ];
  }, [nodes, pending]);

  const displayEdges = useMemo(() => {
    if (!pending?.sourceId) return styledEdges;
    const sourceNode = nodes.find((n) => n.id === pending.sourceId);
    const label =
      sourceNode?.data.kind === 'condition'
        ? nextConditionBranchLabel(sourceNode, edges)
        : undefined;
    const branchStyle = withBranchLabelStyle(label);
    const yes = isYesBranch(label);
    const no = isNoBranch(label);
    const stroke = yes ? '#10b981' : no ? '#f43f5e' : '#0a61d7';
    const previewEdge: WorkflowFlowEdge = {
      id: PENDING_EDGE_ID,
      source: pending.sourceId,
      target: PENDING_NODE_ID,
      sourceHandle: pending.sourceHandle ?? undefined,
      targetHandle: 'pending-target',
      type: DEFAULT_EDGE_TYPE,
      animated: true,
      focusable: false,
      selectable: false,
      ...branchStyle,
      style: {
        stroke,
        strokeWidth: 1.75,
        strokeDasharray: '6 4',
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: stroke,
      },
    };
    return [...styledEdges, previewEdge];
  }, [styledEdges, pending, nodes, edges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      const realChanges = changes.filter((c) => !('id' in c) || c.id !== PENDING_NODE_ID);
      if (realChanges.length === 0) return;

      const removals = realChanges.filter((c) => c.type === 'remove');
      if (removals.length > 0) {
        const removedIds = new Set(removals.map((c) => c.id));
        onNodesChangeAction(nodes.filter((n) => !removedIds.has(n.id)));
        onEdgesChangeAction(
          edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
        );
        if (selectedNodeId && removedIds.has(selectedNodeId)) onSelectNodeAction(null);
        return;
      }
      // Include select changes so RF controlled selection stays on the draft nodes.
      onNodesChangeAction(applyNodeChanges(realChanges, nodes));
    },
    [nodes, edges, selectedNodeId, onNodesChangeAction, onEdgesChangeAction, onSelectNodeAction],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => {
      const realChanges = changes.filter((c) => !('id' in c) || c.id !== PENDING_EDGE_ID);
      if (realChanges.length === 0) return;
      const removals = realChanges.filter((c) => c.type === 'remove');
      if (removals.length > 0) {
        const removedIds = new Set(removals.map((c) => c.id));
        onEdgesChangeAction(edges.filter((e) => !removedIds.has(e.id)));
        return;
      }
      onEdgesChangeAction(applyEdgeChanges(realChanges, edges));
    },
    [edges, onEdgesChangeAction],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const label =
        sourceNode?.data.kind === 'condition'
          ? nextConditionBranchLabel(sourceNode, edges)
          : undefined;
      onEdgesChangeAction(
        addEdge(
          {
            ...connection,
            ...edgeDefaults,
            ...withBranchLabelStyle(label),
          },
          edges,
        ),
      );
    },
    [edges, nodes, onEdgesChangeAction],
  );

  const onConnectStart = useCallback<
    NonNullable<React.ComponentProps<typeof ReactFlow>['onConnectStart']>
  >((_event, params) => {
    if (params.nodeId) {
      connectingFrom.current = {
        nodeId: params.nodeId,
        handleId: params.handleId,
      };
    }
  }, []);

  const syncInspectorFromCanvasSelection = useCallback(() => {
    const ids = selectedNodeIdsRef.current;
    if (ids.length === 1) {
      if (selectedNodeIdRef.current !== ids[0]) {
        selectedNodeIdRef.current = ids[0];
        onSelectNodeAction(ids[0]);
      }
      return;
    }
    if (selectedNodeIdRef.current !== null) {
      selectedNodeIdRef.current = null;
      onSelectNodeAction(null);
    }
  }, [onSelectNodeAction]);

  const openElementPickerAt = useCallback(
    (clientX: number, clientY: number, source?: { nodeId: string; handleId: string | null }) => {
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      clearEdgeSelection();
      if (!source) {
        onSelectNodeAction(null);
        clearNodeSelection();
      }
      setPending({
        sourceId: source?.nodeId ?? null,
        sourceHandle: source?.handleId ?? null,
        flowX: flowPos.x,
        flowY: flowPos.y,
        screenX: clientX,
        screenY: clientY,
      });
    },
    [screenToFlowPosition, onSelectNodeAction, clearNodeSelection, clearEdgeSelection],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event) => {
      const source = connectingFrom.current;
      connectingFrom.current = null;
      if (!source) return;

      const target = event.target as Element | null;
      const droppedOnHandleOrNode = Boolean(
        target?.closest?.('.react-flow__handle, .react-flow__node'),
      );
      if (droppedOnHandleOrNode) return;

      const { clientX, clientY } =
        'changedTouches' in event
          ? event.changedTouches[0]
          : (event as MouseEvent);

      openElementPickerAt(clientX, clientY, {
        nodeId: source.nodeId,
        handleId: source.handleId,
      });
    },
    [openElementPickerAt],
  );

  const handlePick = useCallback(
    (choice: NodePickerChoice) => {
      if (!pending) return;
      const id = newNodeId(choice.kind);
      const nextNode: WorkflowFlowNode = {
        id,
        type: 'workflow',
        position: { x: pending.flowX - 120, y: pending.flowY },
        data: {
          kind: choice.kind,
          catalogType: choice.catalogType,
          name: choice.name,
          title: choice.title,
          subtitle: choice.subtitle,
          config: choice.config,
        },
      };
      onNodesChangeAction([...nodes, nextNode]);

      if (pending.sourceId) {
        const sourceNode = nodes.find((n) => n.id === pending.sourceId);
        const label =
          sourceNode?.data.kind === 'condition'
            ? nextConditionBranchLabel(sourceNode, edges)
            : undefined;
        const nextEdge: WorkflowFlowEdge = {
          id: `e_${pending.sourceId}_${id}`,
          source: pending.sourceId,
          target: id,
          sourceHandle: pending.sourceHandle ?? undefined,
          targetHandle: 'source-top',
          ...edgeDefaults,
          ...withBranchLabelStyle(label),
        };
        onEdgesChangeAction([...edges, nextEdge]);
      }

      onSelectNodeAction(id);
      setPending(null);
    },
    [pending, nodes, edges, onNodesChangeAction, onEdgesChangeAction, onSelectNodeAction],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isEditableTarget(event.target)) return;
      if (!wrapperRef.current?.contains(document.activeElement) && document.activeElement !== document.body) {
        // Allow delete when focus is inside the canvas wrapper or body after a canvas click
        if (!wrapperRef.current?.contains(event.target as Node)) return;
      }

      if (selectedEdgeId) {
        event.preventDefault();
        deleteEdge(selectedEdgeId);
        return;
      }
      if (selectedNodeIds.length > 0) {
        event.preventDefault();
        deleteNodes(selectedNodeIds);
        return;
      }
      if (selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeId, selectedNodeIds, deleteEdge, deleteNode, deleteNodes]);

  return (
    <div className="relative h-full w-full" ref={wrapperRef}>
      <CanvasNodeActionsProvider
        onRequestDelete={onRequestDeleteNode}
        onRequestDisconnect={onRequestDisconnectNode}
      >
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={(event, node) => {
          clearEdgeSelection();
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          onSelectNodeAction(node.id);
        }}
        onEdgeClick={(_, edge) => {
          onSelectNodeAction(null);
          clearNodeSelection();
          if (!edge.selected) {
            onEdgesChangeAction(
              edges.map((e) => ({
                ...e,
                selected: e.id === edge.id,
              })),
            );
          }
        }}
        onPaneClick={() => {
          onSelectNodeAction(null);
          clearNodeSelection();
          clearEdgeSelection();
          setPending(null);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          openElementPickerAt(event.clientX, event.clientY);
        }}
        onNodeContextMenu={(event) => {
          event.preventDefault();
          openElementPickerAt(event.clientX, event.clientY);
        }}
        onSelectionEnd={syncInspectorFromCanvasSelection}
        panOnDrag
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionMode={SelectionMode.Partial}
        edgesFocusable
        edgesReconnectable
        elementsSelectable
        nodesFocusable
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 1 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={edgeDefaults}
        connectionLineStyle={{ stroke: '#0a61d7', strokeWidth: 1.5 }}
        deleteKeyCode={null}
        className="bg-transparent"
      >
        <Background
          id="workflow-dots"
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.2}
          color="rgba(148,163,184,0.55)"
        />
        <CanvasZoomControl />
      </ReactFlow>
      </CanvasNodeActionsProvider>

      {(selectedNodeIds.length > 0 || selectedEdgeId) && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#e6e6e6] bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm">
          {selectedNodeIds.length > 0 && (
            <>
              {selectedNodeIds.length > 1 && (
                <span className="px-2 text-[11px] font-medium text-gray-500">
                  {tBuilder('selectedNodesCount', { count: selectedNodeIds.length })}
                </span>
              )}
              <button
                type="button"
                onClick={() => disconnectNodes(selectedNodeIds)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50"
                title={tBuilder('disconnectNode')}
              >
                <Unplug className="h-3.5 w-3.5" />
                {tBuilder('disconnectNode')}
              </button>
              <button
                type="button"
                onClick={() => deleteNodes(selectedNodeIds)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                title={tBuilder('deleteNode')}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {tBuilder('deleteNode')}
              </button>
            </>
          )}
          {selectedEdgeId && selectedNodeIds.length === 0 && (
            <>
              {selectedConditionEdge && (
                <>
                  <button
                    type="button"
                    onClick={() => setConditionEdgeBranch(selectedEdgeId, BRANCH_YES)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      isYesBranch(selectedConditionEdge.edge.label)
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'text-emerald-700/70 hover:bg-emerald-50'
                    }`}
                    title={tBuilder('setBranchYes')}
                  >
                    {tBuilder('conditionYes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConditionEdgeBranch(selectedEdgeId, BRANCH_NO)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      isNoBranch(selectedConditionEdge.edge.label)
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                        : 'text-rose-700/70 hover:bg-rose-50'
                    }`}
                    title={tBuilder('setBranchNo')}
                  >
                    {tBuilder('conditionNo')}
                  </button>
                  <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden />
                </>
              )}
              <button
                type="button"
                onClick={() => deleteEdge(selectedEdgeId)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                title={tBuilder('deleteEdge')}
              >
                <Unplug className="h-3.5 w-3.5" />
                {tBuilder('deleteEdge')}
              </button>
            </>
          )}
        </div>
      )}

      {pending && (
        <NodeAddMenu
          workflowType={workflowType}
          screenX={pending.screenX}
          screenY={pending.screenY}
          onPickAction={handlePick}
          onCloseAction={() => setPending(null)}
        />
      )}
    </div>
  );
}

export function WorkflowCanvas(
  props: React.ComponentProps<typeof WorkflowCanvasInner>,
) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
