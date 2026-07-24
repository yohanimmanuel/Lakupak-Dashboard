'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AppWindow, Bolt, Bot, GitBranch, Trash2, Unplug, Zap } from 'lucide-react';
import type { WorkflowFlowNode } from './canvasTypes';

const handleClass =
  '!h-2.5 !w-2.5 !border-2 !border-white !bg-[#0a61d7] !opacity-70 hover:!opacity-100';

/** One connectable port per side — works with ConnectionMode.Loose for flexible in/out. */
function FourSideHandles() {
  return (
    <>
      <Handle id="source-top" type="source" position={Position.Top} className={handleClass} />
      <Handle id="source-right" type="source" position={Position.Right} className={handleClass} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className={handleClass} />
      <Handle id="source-left" type="source" position={Position.Left} className={handleClass} />
    </>
  );
}

function WorkflowFlowNodeComponent({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const isAgent = data.kind === 'agent';
  const isCondition = data.kind === 'condition';

  return (
    <div
      className={`relative w-[240px] rounded-xl border p-3 shadow-sm transition-shadow ${
        isCondition
          ? selected
            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/30'
            : 'border-amber-200 bg-amber-50/80 hover:border-amber-400'
          : isAgent
            ? selected
              ? 'border-[#084ba6] bg-[#0a61d7] text-white shadow-[0_12px_28px_-14px_rgba(10,97,215,0.55)]'
              : 'border-slate-800 bg-slate-900 text-white'
            : selected
              ? 'border-[#0a61d7] bg-white ring-2 ring-[#0a61d7]/25'
              : 'border-[#e6e6e6] bg-white hover:border-[#0a61d7]/40'
      }`}
    >
      {selected && (
        <div className="absolute -right-2 -top-2 z-10 flex gap-1">
          {data.onRequestDisconnect && (
            <button
              type="button"
              className="rounded-full border border-[#e6e6e6] bg-white p-1 text-gray-600 shadow-sm hover:bg-gray-50"
              title="Disconnect"
              aria-label="Disconnect"
              onClick={(e) => {
                e.stopPropagation();
                data.onRequestDisconnect?.();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Unplug className="h-3 w-3" />
            </button>
          )}
          {data.onRequestDelete && (
            <button
              type="button"
              className="rounded-full border border-red-200 bg-white p-1 text-red-600 shadow-sm hover:bg-red-50"
              title="Delete"
              aria-label="Delete"
              onClick={(e) => {
                e.stopPropagation();
                data.onRequestDelete?.();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <FourSideHandles />

      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isAgent
              ? 'bg-white/15'
              : isCondition
                ? 'bg-amber-100 text-amber-700'
                : 'bg-[#f7faff] text-[#0a61d7]'
          }`}
        >
          {data.kind === 'trigger' ? (
            <Bolt className="h-4 w-4" />
          ) : data.kind === 'agent' ? (
            <Bot className="h-4 w-4" />
          ) : data.kind === 'app' ? (
            <AppWindow className="h-4 w-4" />
          ) : isCondition ? (
            <GitBranch className="h-4 w-4" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p
            className={`text-xs font-semibold ${
              isAgent ? 'text-white' : isCondition ? 'text-amber-950' : 'text-black'
            }`}
          >
            {data.title}
          </p>
          <p
            className={`mt-0.5 text-[11px] leading-snug ${
              isAgent ? 'text-white/75' : isCondition ? 'text-amber-800/80' : 'text-gray-500'
            }`}
          >
            {data.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export const WorkflowFlowNodeView = memo(WorkflowFlowNodeComponent);
