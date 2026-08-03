'use client';

import React, { createContext, memo, useContext } from 'react';
import { Handle, Position, useNodeId, type NodeProps } from '@xyflow/react';
import { Bolt, Bot, GitBranch, Trash2, Unplug, Zap } from 'lucide-react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { WorkflowFlowNode } from './canvasTypes';

const handleClass =
  '!h-2.5 !w-2.5 !border-2 !border-white !bg-[#0a61d7] !opacity-70 hover:!opacity-100';

type CanvasNodeActions = {
  onRequestDelete: (nodeId: string) => void;
  onRequestDisconnect: (nodeId: string) => void;
};

const CanvasNodeActionsContext = createContext<CanvasNodeActions | null>(null);

export function CanvasNodeActionsProvider({
  onRequestDelete,
  onRequestDisconnect,
  children,
}: CanvasNodeActions & { children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ onRequestDelete, onRequestDisconnect }),
    [onRequestDelete, onRequestDisconnect],
  );
  return (
    <CanvasNodeActionsContext.Provider value={value}>{children}</CanvasNodeActionsContext.Provider>
  );
}

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
  const nodeId = useNodeId() ?? '';
  const actions = useContext(CanvasNodeActionsContext);
  const { tBuilder, translateTrigger, translateAction } = useAutomationTranslations();
  const isAgent = data.kind === 'agent';
  const isCondition = data.kind === 'condition';
  const isApp = data.kind === 'app';

  const kindLabel =
    data.kind === 'trigger'
      ? tBuilder('nodeTrigger')
      : data.kind === 'agent'
        ? tBuilder('nodeAgent')
        : data.kind === 'app'
          ? tBuilder('nodeApp')
          : data.kind === 'condition'
            ? tBuilder('nodeCondition')
            : tBuilder('nodeAction');

  const typeDetail = (() => {
    if (data.name) return data.name;
    if (data.kind === 'trigger') return translateTrigger(data.catalogType);
    if (data.kind === 'action') return translateAction(data.catalogType);
    if (data.kind === 'app') {
      return data.catalogType === 'app_email' ? tBuilder('appEmail') : tBuilder('appWebhook');
    }
    if (data.kind === 'condition') return tBuilder('conditionSubtitle');
    if (data.kind === 'agent') return tBuilder('agentSubtitle');
    return data.title;
  })();

  return (
    <div
      className={`relative w-[230px] rounded-xl border px-3 py-2.5 shadow-sm transition-shadow ${
        isCondition
          ? selected
            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/30'
            : 'border-amber-200 bg-amber-50/80 hover:border-amber-400'
          : isAgent
            ? selected
              ? 'border-[#084ba6] bg-[#0a61d7] text-white shadow-[0_12px_28px_-14px_rgba(10,97,215,0.55)]'
              : 'border-slate-800 bg-slate-900 text-white'
            : isApp
              ? selected
                ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-400/25'
                : 'border-violet-200 bg-white hover:border-violet-400'
              : selected
                ? 'border-[#0a61d7] bg-white ring-2 ring-[#0a61d7]/25'
                : 'border-[#e6e6e6] bg-white hover:border-[#0a61d7]/40'
      }`}
    >
      {selected && actions && (
        <div className="absolute -right-2 -top-2 z-10 flex gap-1">
          <button
            type="button"
            className="rounded-full border border-[#e6e6e6] bg-white p-1 text-gray-600 shadow-sm hover:bg-gray-50"
            title={tBuilder('disconnectNode')}
            aria-label={tBuilder('disconnectNode')}
            onClick={(e) => {
              e.stopPropagation();
              actions.onRequestDisconnect(nodeId);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Unplug className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded-full border border-red-200 bg-white p-1 text-red-600 shadow-sm hover:bg-red-50"
            title={tBuilder('deleteNode')}
            aria-label={tBuilder('deleteNode')}
            onClick={(e) => {
              e.stopPropagation();
              actions.onRequestDelete(nodeId);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      <FourSideHandles />

      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isAgent
              ? 'bg-white/15'
              : isCondition
                ? 'bg-amber-100 text-amber-700'
                : isApp
                ? data.catalogType === 'app_webhook'
                  ? 'bg-[#25D366] text-white'
                  : 'bg-white ring-1 ring-violet-100'
                : data.kind === 'trigger'
                    ? 'bg-sky-50 text-[#0a61d7]'
                    : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {data.kind === 'trigger' ? (
            <Bolt className="h-4 w-4" />
          ) : data.kind === 'agent' ? (
            <Bot className="h-4 w-4" />
          ) : data.kind === 'app' ? (
            data.catalogType === 'app_email' ? (
              <img src="/gmail.svg" alt="" className="h-4 w-4" width={16} height={16} />
            ) : (
              <img src="/whatsapp.svg" alt="" className="h-4 w-4" width={16} height={16} />
            )
          ) : isCondition ? (
            <GitBranch className="h-4 w-4" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-xs font-semibold ${
              isAgent ? 'text-white' : isCondition ? 'text-amber-950' : 'text-black'
            }`}
          >
            {typeDetail}
          </p>
          <p
            className={`mt-0.5 truncate text-[11px] leading-snug ${
              isAgent ? 'text-white/75' : isCondition ? 'text-amber-800/80' : 'text-gray-500'
            }`}
          >
            {kindLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

export const WorkflowFlowNodeView = memo(WorkflowFlowNodeComponent);
