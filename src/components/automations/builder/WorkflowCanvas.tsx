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
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Minus, Plus, Trash2, Unplug } from 'lucide-react';

import type { WorkflowType } from '../automationTypes';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { WorkflowFlowNodeView } from './WorkflowFlowNode';
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

const nodeTypes = { workflow: WorkflowFlowNodeView };

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
        className="nopan nodrag nowheel flex h-9 items-stretch overflow-hidden rounded-lg border border-[#e6e6e6] bg-white text-gray-600 shadow-sm"
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const deleteNode = useCallback(
    (nodeId: string) => {
      onNodesChangeAction(nodes.filter((n) => n.id !== nodeId));
      onEdgesChangeAction(edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNodeId === nodeId) onSelectNodeAction(null);
      setSelectedEdgeId(null);
    },
    [nodes, edges, selectedNodeId, onNodesChangeAction, onEdgesChangeAction, onSelectNodeAction],
  );

  const disconnectNode = useCallback(
    (nodeId: string) => {
      onEdgesChangeAction(edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedEdgeId(null);
    },
    [edges, onEdgesChangeAction],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      onEdgesChangeAction(edges.filter((e) => e.id !== edgeId));
      setSelectedEdgeId((prev) => (prev === edgeId ? null : prev));
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

  const selectedConditionEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const source = nodes.find((n) => n.id === edge.source);
    if (!source || source.data.kind !== 'condition') return null;
    return { edge, source };
  }, [selectedEdgeId, edges, nodes]);

  const selectedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          onRequestDelete: () => deleteNode(n.id),
          onRequestDisconnect: () => disconnectNode(n.id),
        },
      })),
    [nodes, selectedNodeId, deleteNode, disconnectNode],
  );

  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const selected = e.id === selectedEdgeId;
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
    [edges, selectedEdgeId],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      const removals = changes.filter((c) => c.type === 'remove');
      if (removals.length > 0) {
        const removedIds = new Set(removals.map((c) => c.id));
        onNodesChangeAction(nodes.filter((n) => !removedIds.has(n.id)));
        onEdgesChangeAction(
          edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
        );
        if (selectedNodeId && removedIds.has(selectedNodeId)) onSelectNodeAction(null);
        setSelectedEdgeId(null);
        return;
      }
      onNodesChangeAction(applyNodeChanges(changes, nodes));
    },
    [nodes, edges, selectedNodeId, onNodesChangeAction, onEdgesChangeAction, onSelectNodeAction],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => {
      const removals = changes.filter((c) => c.type === 'remove');
      if (removals.length > 0) {
        const removedIds = new Set(removals.map((c) => c.id));
        onEdgesChangeAction(edges.filter((e) => !removedIds.has(e.id)));
        setSelectedEdgeId((prev) => (prev && removedIds.has(prev) ? null : prev));
        return;
      }
      onEdgesChangeAction(applyEdgeChanges(changes, edges));
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

      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      setPending({
        sourceId: source.nodeId,
        sourceHandle: source.handleId,
        flowX: flowPos.x,
        flowY: flowPos.y,
        screenX: clientX,
        screenY: clientY,
      });
    },
    [screenToFlowPosition],
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
          title: choice.title,
          subtitle: choice.subtitle,
          config: choice.config,
        },
      };
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
      onNodesChangeAction([...nodes, nextNode]);
      onEdgesChangeAction([...edges, nextEdge]);
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
      if (selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeId, deleteEdge, deleteNode]);

  return (
    <div className="relative h-full w-full" ref={wrapperRef}>
      <ReactFlow
        nodes={selectedNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, node) => {
          onSelectNodeAction(node.id);
          setSelectedEdgeId(null);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeId(edge.id);
          onSelectNodeAction(null);
        }}
        onPaneClick={() => {
          onSelectNodeAction(null);
          setSelectedEdgeId(null);
          setPending(null);
        }}
        edgesFocusable
        edgesReconnectable
        elementsSelectable
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.25 }}
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

      {(selectedNodeId || selectedEdgeId) && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#e6e6e6] bg-white/95 px-2 py-1.5 shadow-md backdrop-blur-sm">
          {selectedNodeId && (
            <>
              <button
                type="button"
                onClick={() => disconnectNode(selectedNodeId)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50"
                title={tBuilder('disconnectNode')}
              >
                <Unplug className="h-3.5 w-3.5" />
                {tBuilder('disconnectNode')}
              </button>
              <button
                type="button"
                onClick={() => deleteNode(selectedNodeId)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                title={tBuilder('deleteNode')}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {tBuilder('deleteNode')}
              </button>
            </>
          )}
          {selectedEdgeId && (
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
          onPick={handlePick}
          onClose={() => setPending(null)}
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
