'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, isValid } from 'date-fns';
import { enUS, id as idLocale } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Maximize2, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { AutomationRun } from '../automationTypes';

const SIDEBAR_MESSAGE_MAX = 120;
const MODAL_COLLAPSED_MAX = 220;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

function formatRunTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!isValid(date)) return '—';
  const isId = locale === 'id';
  return format(date, isId ? 'd MMM yyyy HH:mm' : 'MMM d, yyyy HH:mm', {
    locale: isId ? idLocale : enUS,
  });
}

function truncateMessage(message: string, max: number): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function RunListItem({
  run,
  locale,
  truncated,
  expandable = false,
  expanded = false,
  onToggleExpand,
  onDeleteRunAction,
  clearing,
  clearLabel,
  expandLabel,
  collapseLabel,
}: {
  run: AutomationRun;
  locale: string;
  truncated: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onDeleteRunAction?: (runId: string) => void;
  clearing?: boolean;
  clearLabel: string;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const message = run.message?.trim() || '';
  const canExpand =
    expandable && message.length > MODAL_COLLAPSED_MAX && Boolean(onToggleExpand);
  const displayMessage = !message
    ? ''
    : truncated
      ? truncateMessage(message, SIDEBAR_MESSAGE_MAX)
      : canExpand && !expanded
        ? truncateMessage(message, MODAL_COLLAPSED_MAX)
        : message;

  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-black">
              {run.status}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-[11px] text-gray-500">
                {formatRunTimestamp(run.createdAt, locale)}
              </span>
              {canExpand ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-black"
                  title={expanded ? collapseLabel : expandLabel}
                  aria-label={expanded ? collapseLabel : expandLabel}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
              {onDeleteRunAction ? (
                <button
                  type="button"
                  onClick={() => onDeleteRunAction(run.id)}
                  disabled={clearing}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  title={clearLabel}
                  aria-label={clearLabel}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          {displayMessage ? (
            <p
              className={
                truncated || (canExpand && !expanded)
                  ? 'mt-1 text-xs leading-snug text-gray-500'
                  : 'mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-600'
              }
            >
              {displayMessage}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Run history list — sits inside StepDetailsPanel, not as its own card. */
export function WorkflowRunsPanel({
  runs,
  onDeleteRunAction,
  onClearAllAction,
  clearing = false,
}: {
  runs: AutomationRun[];
  onDeleteRunAction?: (runId: string) => void;
  onClearAllAction?: () => void;
  clearing?: boolean;
}) {
  const { tRuns } = useAutomationTranslations();
  const locale = useLocale();
  const titleId = useId();
  const canClear = Boolean(onDeleteRunAction || onClearAllAction);
  const [fullOpen, setFullOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const viewFullButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!fullOpen) {
      setExpandedIds(new Set());
      return;
    }

    const root = dialogRef.current;
    const opener = viewFullButtonRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusInitial = () => {
      if (!root) return;
      const list = getFocusableElements(root);
      (list[0] ?? root).focus();
    };
    const focusId = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setFullOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !root) return;

      const list = getFocusableElements(root);
      if (list.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      if (!root.contains(document.activeElement)) {
        event.preventDefault();
        list[0]?.focus();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusId);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [fullOpen]);

  const toggleExpanded = (runId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-black">{tRuns('title')}</h4>
        <div className="flex shrink-0 items-center gap-2">
          {runs.length > 0 ? (
            <button
              ref={viewFullButtonRef}
              type="button"
              onClick={() => setFullOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0a61d7] hover:underline"
            >
              <Maximize2 className="h-3 w-3" />
              {tRuns('viewFull')}
            </button>
          ) : null}
          {canClear && runs.length > 0 && onClearAllAction ? (
            <button
              type="button"
              onClick={onClearAllAction}
              disabled={clearing}
              className="text-[11px] font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tRuns('clearAll')}
            </button>
          ) : null}
        </div>
      </div>
      {runs.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">{tRuns('empty')}</p>
      ) : (
        <ul className="mt-2 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-[#e6e6e6]">
          {runs.map((run) => (
            <RunListItem
              key={run.id}
              run={run}
              locale={locale}
              truncated
              onDeleteRunAction={onDeleteRunAction}
              clearing={clearing}
              clearLabel={tRuns('clearRun')}
            />
          ))}
        </ul>
      )}

      {mounted &&
        fullOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 sm:p-6"
            onClick={() => setFullOpen(false)}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="flex max-h-[min(90dvh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#e6e6e6] px-4 py-3">
                <h3 id={titleId} className="text-sm font-bold text-black">
                  {tRuns('fullTitle')}
                </h3>
                <div className="flex items-center gap-2">
                  {canClear && runs.length > 0 && onClearAllAction ? (
                    <button
                      type="button"
                      onClick={onClearAllAction}
                      disabled={clearing}
                      className="text-[11px] font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {tRuns('clearAll')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setFullOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-black"
                    aria-label={tRuns('closeFull')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {runs.length === 0 ? (
                  <p className="text-xs text-gray-500">{tRuns('empty')}</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-[#e6e6e6]">
                    {runs.map((run) => (
                      <RunListItem
                        key={run.id}
                        run={run}
                        locale={locale}
                        truncated={false}
                        expandable
                        expanded={expandedIds.has(run.id)}
                        onToggleExpand={() => toggleExpanded(run.id)}
                        onDeleteRunAction={onDeleteRunAction}
                        clearing={clearing}
                        clearLabel={tRuns('clearRun')}
                        expandLabel={tRuns('expandRun')}
                        collapseLabel={tRuns('collapseRun')}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
