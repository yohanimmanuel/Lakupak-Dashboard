'use client';

import React, { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Play, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { WorkflowStatus } from '../automationTypes';

function SideToggle({
  open,
  side,
  onToggle,
  collapseLabel,
  expandLabel,
}: {
  open: boolean;
  side: 'left' | 'right';
  onToggle: () => void;
  collapseLabel: string;
  expandLabel: string;
}) {
  const Chevron = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <div className="pointer-events-auto self-start pt-8">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-full border border-[#e6e6e6] bg-white p-1.5 text-gray-600 shadow-sm transition-transform duration-300 hover:scale-105 hover:bg-gray-50"
        aria-label={open ? collapseLabel : expandLabel}
        title={open ? collapseLabel : expandLabel}
        aria-expanded={open}
      >
        <span
          className={`block transition-transform duration-300 ease-in-out ${
            open ? 'rotate-0' : 'rotate-180'
          }`}
        >
          <Chevron className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}

export function WorkflowBuilderShell({
  title,
  status,
  saving,
  onSaveDraftAction,
  onActivateAction,
  onTestRunAction,
  showTestRun,
  canvas,
  leftPanel,
  rightPanel,
}: {
  title: string;
  status: WorkflowStatus;
  saving?: boolean;
  onSaveDraftAction: () => void | Promise<void>;
  onActivateAction: () => void;
  onTestRunAction?: () => void;
  showTestRun?: boolean;
  canvas: React.ReactNode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}) {
  const router = useRouter();
  const { tBuilder, translateStatus } = useAutomationTranslations();
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [draftSaving, setDraftSaving] = useState(false);

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    try {
      await onSaveDraftAction();
    } finally {
      setDraftSaving(false);
    }
  };

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-[#f7f9fc]">
      <div className="absolute inset-0 z-0">{canvas}</div>

      <div className="absolute left-3 right-3 top-3 z-30 flex flex-col gap-3 rounded-xl border border-[#e6e6e6] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/automation')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] px-3 py-2 text-xs font-medium text-black hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {tBuilder('back')}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-black">
              {title || tBuilder('untitled')}
            </h1>
            <span className="mt-0.5 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
              {translateStatus(status)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showTestRun && onTestRunAction && (
            <button
              type="button"
              onClick={onTestRunAction}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {tBuilder('testRun')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={saving || draftSaving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
          >
            {draftSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {tBuilder('saveDraft')}
          </button>
          <button
            type="button"
            onClick={onActivateAction}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6] disabled:opacity-50"
          >
            {tBuilder('activate')}
          </button>
        </div>
      </div>

      {/* Left: workflow details — leave bottom gap so zoom controls stay clickable */}
      <div className="pointer-events-none absolute bottom-16 left-3 top-24 z-30 flex items-start gap-2">
        <aside
          className={`pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            leftOpen
              ? 'w-[min(100vw-5rem,22rem)] translate-x-0 opacity-100'
              : 'w-0 -translate-x-3 opacity-0'
          }`}
        >
          <div className="ml-auto flex max-h-full min-h-0 w-[min(100vw-5rem,22rem)] flex-col gap-3 overflow-y-auto overflow-x-visible pb-2 pr-1">
            {leftPanel}
          </div>
        </aside>
        <SideToggle
          open={leftOpen}
          side="left"
          onToggle={() => setLeftOpen((v) => !v)}
          collapseLabel={tBuilder('collapseWorkflowDetails')}
          expandLabel={tBuilder('expandWorkflowDetails')}
        />
      </div>

      {/* Right: step details */}
      <div className="pointer-events-none absolute bottom-16 right-3 top-24 z-30 flex items-start gap-2">
        <SideToggle
          open={rightOpen}
          side="right"
          onToggle={() => setRightOpen((v) => !v)}
          collapseLabel={tBuilder('collapseStepDetails')}
          expandLabel={tBuilder('expandStepDetails')}
        />
        <aside
          className={`pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            rightOpen
              ? 'w-[min(100vw-5rem,22rem)] translate-x-0 opacity-100'
              : 'w-0 translate-x-3 opacity-0'
          }`}
        >
          <div className="mr-auto flex max-h-full min-h-0 w-[min(100vw-5rem,22rem)] flex-col gap-3 overflow-y-auto overflow-x-visible pb-2 pl-1">
            {rightPanel}
          </div>
        </aside>
      </div>
    </div>
  );
}
