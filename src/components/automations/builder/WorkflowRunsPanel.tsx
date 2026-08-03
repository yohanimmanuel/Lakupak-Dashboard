'use client';

import React from 'react';
import { format, isValid } from 'date-fns';
import { enUS, id as idLocale } from 'date-fns/locale';
import { X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import type { AutomationRun } from '../automationTypes';

function formatRunTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!isValid(date)) return '—';
  const isId = locale === 'id';
  return format(date, isId ? 'd MMM yyyy HH:mm' : 'MMM d, yyyy HH:mm', {
    locale: isId ? idLocale : enUS,
  });
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
  const canClear = Boolean(onDeleteRunAction || onClearAllAction);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-black">{tRuns('title')}</h4>
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
      {runs.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">{tRuns('empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-[#e6e6e6]">
          {runs.map((run) => (
            <li key={run.id} className="px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-black">
                      {run.status}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {formatRunTimestamp(run.createdAt, locale)}
                    </span>
                  </div>
                  {run.message && <p className="mt-1 text-xs text-gray-500">{run.message}</p>}
                </div>
                {onDeleteRunAction ? (
                  <button
                    type="button"
                    onClick={() => onDeleteRunAction(run.id)}
                    disabled={clearing}
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    title={tRuns('clearRun')}
                    aria-label={tRuns('clearRun')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
