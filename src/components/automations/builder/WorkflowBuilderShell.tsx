'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Pause, Play, RefreshCw, Save, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { AskAiNavButton } from '@/components/automations/AutomationCopilot';
import { useLakuAiPanel } from '@/components/lakuAi/LakuAiPanelContext';
import type { WorkflowCanvasEdit, WorkflowPlanStep } from '@/lib/lakuAi/workflowPlan';
import type { WorkflowStatus } from '../automationTypes';

type BuilderPanelControls = { closeWorkflowDetails: () => void };

const BuilderPanelContext = createContext<BuilderPanelControls | null>(null);

/** Cmd on Apple platforms, Ctrl elsewhere. Safe when `navigator` is missing (SSR). */
function platformUndoModifier(): 'Cmd' | 'Ctrl' {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = navigator.platform ?? '';
  const userAgent = navigator.userAgent ?? '';
  if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS/i.test(userAgent)) return 'Cmd';
  return 'Ctrl';
}

/** Lets the workflow details card render its own close control. */
export function useBuilderPanelControls() {
  return useContext(BuilderPanelContext);
}

type ToolbarBusy = 'undo' | 'test' | 'save' | 'pause' | 'activate' | null;

export function WorkflowBuilderShell({
  title,
  status,
  saving,
  onSaveDraftAction,
  onPauseAction,
  onActivateAction,
  onTestRunAction,
  showTestRun,
  onUndoAction,
  canUndo,
  canvas,
  leftPanel,
  rightPanel,
  rightPanelOpen,
  aiAutomationId = null,
  aiApplying = false,
  onApplyWorkflowRecipeAction,
  onApplyWorkflowPlanAction,
  canvasSteps = null,
  onDismissStepDetailsAction,
  closeAskAiRef,
  initialConversationId = null,
}: {
  title: string;
  status: WorkflowStatus;
  saving?: boolean;
  onSaveDraftAction: () => boolean | Promise<boolean>;
  onPauseAction: () => boolean | void | Promise<boolean | void>;
  onActivateAction: () => boolean | void | Promise<boolean | void>;
  onTestRunAction?: () => void | Promise<unknown>;
  showTestRun?: boolean;
  onUndoAction?: () => void;
  canUndo?: boolean;
  canvas: React.ReactNode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  /** Step details follow canvas selection — no manual toggle. */
  rightPanelOpen: boolean;
  /** Saved workflow id. Null on a new workflow until the first save. */
  aiAutomationId?: string | null;
  /** Canvas is receiving an AI draft and should ignore clicks. */
  aiApplying?: boolean;
  onApplyWorkflowRecipeAction?: (recipeId: string) => void;
  onApplyWorkflowPlanAction?: (edit: WorkflowCanvasEdit) => void;
  /** Steps on the canvas now, sent with Ask AI so an edit keeps them. */
  canvasSteps?: WorkflowPlanStep[] | null;
  /** Shared Copilot conversation to continue in Ask AI. */
  initialConversationId?: string | null;
  /** Closes the step details card so Ask AI can use that side. */
  onDismissStepDetailsAction?: () => void;
  /** Canvas selection calls this to close Ask AI. */
  closeAskAiRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const { tBuilder, translateStatus } = useAutomationTranslations();
  const tCopilot = useTranslations('dashboard.automation.copilot');
  const {
    open: aiOpen,
    openPanel,
    closePanel,
    registerWorkflowAi,
    unregisterWorkflowAi,
  } = useLakuAiPanel();
  const [leftOpen, setLeftOpen] = useState(true);

  useEffect(() => {
    if (!onApplyWorkflowPlanAction) {
      unregisterWorkflowAi();
      return;
    }
    registerWorkflowAi({
      automationId: aiAutomationId,
      canvasSteps: canvasSteps ?? null,
      initialConversationId,
      onApplyWorkflowPlanAction,
      onApplyWorkflowRecipeAction,
    });
  }, [
    aiAutomationId,
    canvasSteps,
    initialConversationId,
    onApplyWorkflowPlanAction,
    onApplyWorkflowRecipeAction,
    registerWorkflowAi,
    unregisterWorkflowAi,
  ]);

  useEffect(() => () => unregisterWorkflowAi(), [unregisterWorkflowAi]);

  useEffect(() => {
    if (!closeAskAiRef) return;
    closeAskAiRef.current = () => closePanel();
    return () => {
      closeAskAiRef.current = null;
    };
  }, [closeAskAiRef, closePanel]);
  const [returnFocusToLeftToggle, setReturnFocusToLeftToggle] = useState(false);
  const leftToggleRef = useRef<HTMLButtonElement>(null);
  const [toolbarBusy, setToolbarBusy] = useState<ToolbarBusy>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const busy = Boolean(saving) || toolbarBusy !== null;

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

  const undoShortcutTitle = useMemo(
    () => tBuilder('undoShortcut', { modifier: platformUndoModifier() }),
    [tBuilder],
  );

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

  const handleUndo = useCallback(() => {
    if (!onUndoAction || !canUndo || busy) return;
    setToolbarBusy('undo');
    try {
      onUndoAction();
    } finally {
      // Sync canvas undo — clear on next frame so the spinner can paint briefly.
      requestAnimationFrame(() => setToolbarBusy(null));
    }
  }, [onUndoAction, canUndo, busy]);

  const handleSaveDraft = useCallback(async () => {
    if (busy) return;
    setToolbarBusy('save');
    try {
      const ok = await onSaveDraftAction();
      if (!ok) return;
      const savedAt = Date.now();
      setLastSavedAt(savedAt);
      setNowTs(savedAt);
    } finally {
      setToolbarBusy(null);
    }
  }, [busy, onSaveDraftAction]);

  const handleTestRun = useCallback(async () => {
    if (!onTestRunAction || busy) return;
    setToolbarBusy('test');
    try {
      await onTestRunAction();
    } finally {
      setToolbarBusy(null);
    }
  }, [busy, onTestRunAction]);

  const handlePause = useCallback(async () => {
    if (busy) return;
    setToolbarBusy('pause');
    try {
      const ok = await onPauseAction();
      if (ok === false) return;
      const savedAt = Date.now();
      setLastSavedAt(savedAt);
      setNowTs(savedAt);
    } finally {
      setToolbarBusy(null);
    }
  }, [busy, onPauseAction]);

  const handleActivate = useCallback(async () => {
    if (busy) return;
    setToolbarBusy('activate');
    try {
      const ok = await onActivateAction();
      if (ok === false) return;
      const savedAt = Date.now();
      setLastSavedAt(savedAt);
      setNowTs(savedAt);
    } finally {
      setToolbarBusy(null);
    }
  }, [busy, onActivateAction]);

  useEffect(() => {
    if (!onUndoAction) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (!canUndo || busy) return;
      event.preventDefault();
      handleUndo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onUndoAction, canUndo, busy, handleUndo]);

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-[#f7f9fc]">
      <div className="absolute inset-0 z-0">{canvas}</div>

      {aiApplying ? (
        <div
          className="absolute inset-0 z-[35] flex items-center justify-center bg-white/50"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[#0a61d7]" />
            <span className="text-sm font-medium text-black">{tBuilder('applyingWorkflow')}</span>
          </div>
        </div>
      ) : null}

      <div className="absolute left-3 right-3 top-3 z-30 overflow-x-auto rounded-xl border border-[#e6e6e6] bg-white p-2">
        <div className="flex w-full min-w-max items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/automation')}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {tBuilder('back')}
          </button>
          <div className="flex max-w-[14rem] min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-bold text-black">
              {title || tBuilder('untitled')}
            </h1>
            <span
              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : status === 'paused'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {translateStatus(status)}
            </span>
          </div>
          {savedLabel && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-500">
              <RefreshCw className="h-3.5 w-3.5 text-green-600" />
              {savedLabel}
            </span>
          )}
          <span className="min-w-6 flex-1" aria-hidden />
          <AskAiNavButton
            pressed={aiOpen}
            onPressAction={() => {
              if (aiOpen) {
                closePanel();
                return;
              }
              onDismissStepDetailsAction?.();
              openPanel({ dockEmptyMessage: tCopilot('history.dockEmpty') });
            }}
          />
          <span className="mx-0.5 h-6 w-px shrink-0 bg-[#e6e6e6]" aria-hidden />
          {onUndoAction && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo || busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
              title={undoShortcutTitle}
            >
              {toolbarBusy === 'undo' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              {tBuilder('undo')}
            </button>
          )}
          {showTestRun && onTestRunAction && (
            <button
              type="button"
              onClick={() => void handleTestRun()}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
            >
              {toolbarBusy === 'test' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {tBuilder('testRun')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
          >
            {toolbarBusy === 'save' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {tBuilder('saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => void handlePause()}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-50 disabled:opacity-50"
          >
            {toolbarBusy === 'pause' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            {tBuilder('pause')}
          </button>
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6] disabled:opacity-50"
          >
            {toolbarBusy === 'activate' ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : null}
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
