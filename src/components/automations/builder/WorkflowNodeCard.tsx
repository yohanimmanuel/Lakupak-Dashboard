'use client';

import React from 'react';
import { Bolt, Bot, Zap } from 'lucide-react';
import type { BuilderNodeKind } from '../automationTypes';

export function WorkflowNodeCard({
  kind,
  title,
  subtitle,
  selected,
  onClickAction,
}: {
  kind: BuilderNodeKind;
  title: string;
  subtitle: string;
  selected: boolean;
  onClickAction: () => void;
}) {
  const isAgent = kind === 'agent';

  return (
    <button
      type="button"
      onClick={onClickAction}
      className={`w-full max-w-sm text-left rounded-xl border p-4 transition-shadow ${
        isAgent
          ? selected
            ? 'bg-[#0a61d7] border-[#084ba6] text-white shadow-[0_12px_28px_-14px_rgba(10,97,215,0.55)]'
            : 'bg-slate-900 border-slate-800 text-white shadow-sm hover:bg-slate-800'
          : selected
            ? 'bg-white border-[#0a61d7] ring-2 ring-[#0a61d7]/25 shadow-sm'
            : 'bg-white border-gray-200 shadow-sm hover:border-[#0a61d7]/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isAgent ? 'bg-white/15' : 'bg-[#f7faff] text-[#0a61d7]'
          }`}
        >
          {kind === 'trigger' ? (
            <Bolt className="h-5 w-5" />
          ) : kind === 'agent' ? (
            <Bot className="h-5 w-5" />
          ) : (
            <Zap className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${isAgent ? 'text-white' : 'text-gray-900'}`}>
            {title}
          </p>
          <p className={`mt-0.5 text-xs leading-snug ${isAgent ? 'text-white/75' : 'text-gray-500'}`}>
            {subtitle}
          </p>
        </div>
      </div>
    </button>
  );
}

export function WorkflowConnector() {
  return (
    <div className="flex flex-col items-center py-2" aria-hidden>
      <div className="h-8 w-px bg-[#cbd5e1]" />
      <div className="h-2 w-2 rounded-full bg-[#0a61d7]" />
      <div className="h-8 w-px bg-[#cbd5e1]" />
    </div>
  );
}
