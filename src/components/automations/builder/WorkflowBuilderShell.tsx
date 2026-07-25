'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Play, RefreshCw, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { WorkflowStatus } from '../automationTypes';

type BuilderPanelControls = { closeWorkflowDetails: () => void };

const BuilderPanelContext = createContext<BuilderPanelControls | null>(null);

/** Lets the workflow details card render its own close control. */
export function useBuilderPanelControls() {
  return useContext(BuilderPanelContext);
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
  rightPanelOpen,
}: {
  title: string;
  status: WorkflowStatus;
  saving?: boolean;
  onSaveDraftAction: () => boolean | Promise<boolean>;
  onActivateAction: () => void;
  onTestRunAction?: () => void;
  showTestRun?: boolean;
  canvas: React.ReactNode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  /** Step details follow canvas selection — no manual toggle. */
  rightPanelOpen: boolean;
}) {
  const router = useRouter();
  const { tBuilder, translateStatus } = useAutomationTranslations();
  const [leftOpen, setLeftOpen] = useState(true);
  const [returnFocusToLeftToggle, setReturnFocusToLeftToggle] = useState(false);
  const leftToggleRef = useRef<HTMLButtonElement>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Keep the relative "saved …" label fresh once a save has happened.
  useEffect(() => {
    if (lastSavedAt == null) return;
    const id = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const savedLabel = useMemo(() => {
    if (lastSavedAt == null) return null;
    const minutes = Math.floor(Math.max(0, nowTs - lastSavedAt) / 60_000);
    if (minutes < 1) return tBuilder('savedJustNow');
    if (minutes < 60) return tBuilder('savedMinutesAgo', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return tBuilder('savedHoursAgo', { hours });
    return tBuilder('savedDaysAgo', { days: Math.floor(hours / 24) });
  }, [lastSavedAt, nowTs, tBuilder]);

  const leftPanelControls = useMemo<BuilderPanelControls>(
    () => ({
      closeWorkflowDetails: () => {
        setLeftOpen(false);
        setReturnFocusToLeftToggle(true);
      },
    }),
    [],
  );

  // The closed panel is inert, so focus has to land back on its opener.
  useEffect(() => {
    if (leftOpen || !returnFocusToLeftToggle) return;
    leftToggleRef.current?.focus();
    setReturnFocusToLeftToggle(false);
  }, [leftOpen, returnFocusToLeftToggle]);

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    try {
      const ok = await onSaveDraftAction();
      if (!ok) return;
      const savedAt = Date.now();
      setLastSavedAt(savedAt);
      setNowTs(savedAt);
    } finally {
      setDraftSaving(false);
    }
  };

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-[#f7f9fc]">
      <div className="absolute inset-0 z-0">{canvas}</div>

      <div className="absolute left-3 right-3 top-3 z-30 flex flex-col gap-3 rounded-xl border border-[#e6e6e6] bg-white p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/automation')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] px-3 py-2 text-xs font-medium text-black hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {tBuilder('back')}
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-bold text-black">
              {title || tBuilder('untitled')}
            </h1>
            <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
              {translateStatus(status)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {savedLabel && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <RefreshCw className="h-3.5 w-3.5 text-green-600" />
              {savedLabel}
            </span>
          )}
          <span className="mx-0.5 hidden h-6 w-px bg-[#e6e6e6] sm:inline-block" aria-hidden />
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
      <div className="pointer-events-none absolute bottom-16 left-3 top-18 z-30 flex max-h-full min-h-0 items-stretch">
        {/* Out of flow so the closing card is never shoved sideways by it appearing. */}
        <button
          ref={leftToggleRef}
          type="button"
          onClick={() => setLeftOpen(true)}
          className={`absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black transition-all duration-200 ease-in-out hover:bg-gray-50 ${
            leftOpen
              ? 'pointer-events-none -translate-x-2 opacity-0'
              : 'pointer-events-auto translate-x-0 opacity-100 delay-200'
          }`}
          aria-expanded={leftOpen}
          tabIndex={leftOpen ? -1 : 0}
        >
          {tBuilder('workflowDetailsTitle')}
          <ChevronRight className="h-4 w-4" />
        </button>
        <aside
          className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            leftOpen
              ? 'pointer-events-auto w-[min(100vw-5rem,22rem)] translate-x-0 opacity-100'
              : 'pointer-events-none w-0 -translate-x-3 opacity-0'
          }`}
          aria-hidden={!leftOpen}
          inert={!leftOpen}
        >
          <div className="flex h-full min-h-0 w-[min(100vw-5rem,22rem)] flex-col gap-3 overflow-hidden">
            <BuilderPanelContext.Provider value={leftPanelControls}>
              {leftPanel}
            </BuilderPanelContext.Provider>
          </div>
        </aside>
      </div>

      {/* Right: step details — slides in when a canvas node is selected or created */}
      <div className="pointer-events-none absolute bottom-16 right-3 top-18 z-30 flex max-h-full min-h-0 items-stretch">
        <aside
          className={`flex h-full min-h-0 w-[min(100vw-5rem,22rem)] flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            rightPanelOpen
              ? 'pointer-events-auto translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-6 opacity-0'
          }`}
          aria-hidden={!rightPanelOpen}
          inert={!rightPanelOpen}
        >
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            {rightPanel}
          </div>
        </aside>
      </div>
    </div>
  );
}
