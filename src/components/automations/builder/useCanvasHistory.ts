'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { WorkflowFlowEdge, WorkflowFlowNode } from './canvasTypes';

export type CanvasSnapshot = {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
};

const MAX_HISTORY = 50;

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  try {
    return structuredClone(snapshot);
  } catch {
    return {
      nodes: snapshot.nodes.map((n) => ({ ...n, data: { ...n.data }, position: { ...n.position } })),
      edges: snapshot.edges.map((e) => ({ ...e })),
    };
  }
}

/** True when graph membership or node data changed (ignore position/selection noise). */
export function isStructuralCanvasChange(
  prev: CanvasSnapshot,
  next: Partial<CanvasSnapshot>,
): boolean {
  if (next.nodes) {
    if (next.nodes.length !== prev.nodes.length) return true;
    const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
    for (const node of next.nodes) {
      const before = prevById.get(node.id);
      if (!before) return true;
      if (JSON.stringify(before.data) !== JSON.stringify(node.data)) return true;
    }
  }
  if (next.edges) {
    if (next.edges.length !== prev.edges.length) return true;
    const prevById = new Map(prev.edges.map((e) => [e.id, e]));
    for (const edge of next.edges) {
      const before = prevById.get(edge.id);
      if (!before) return true;
      if (
        before.source !== edge.source ||
        before.target !== edge.target ||
        before.sourceHandle !== edge.sourceHandle ||
        before.targetHandle !== edge.targetHandle ||
        String(before.label ?? '') !== String(edge.label ?? '')
      ) {
        return true;
      }
    }
  }
  return false;
}

export function useCanvasHistory() {
  const stackRef = useRef<CanvasSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const applyingUndoRef = useRef(false);

  const clear = useCallback(() => {
    stackRef.current = [];
    setCanUndo(false);
  }, []);

  const push = useCallback((snapshot: CanvasSnapshot, options?: { force?: boolean }) => {
    if (applyingUndoRef.current) return;
    const top = stackRef.current[stackRef.current.length - 1];
    if (!options?.force && top && !isStructuralCanvasChange(top, snapshot)) return;
    stackRef.current.push(cloneSnapshot(snapshot));
    if (stackRef.current.length > MAX_HISTORY) {
      stackRef.current.shift();
    }
    setCanUndo(true);
  }, []);

  const undo = useCallback((apply: (snapshot: CanvasSnapshot) => void) => {
    const prev = stackRef.current.pop();
    if (!prev) {
      setCanUndo(false);
      return false;
    }
    applyingUndoRef.current = true;
    try {
      apply(prev);
    } finally {
      applyingUndoRef.current = false;
    }
    setCanUndo(stackRef.current.length > 0);
    return true;
  }, []);

  return useMemo(
    () => ({ push, undo, canUndo, clear }),
    [push, undo, canUndo, clear],
  );
}
