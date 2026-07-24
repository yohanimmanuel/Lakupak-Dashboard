'use client';

import React from 'react';
import { format, isValid } from 'date-fns';
import { enUS, id as idLocale } from 'date-fns/locale';
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

export function WorkflowRunsPanel({ runs }: { runs: AutomationRun[] }) {
  const { tRuns } = useAutomationTranslations();
  const locale = useLocale();

  return (
    <div className="mt-4 rounded-lg border border-[#e6e6e6] bg-white">
      <div className="border-b border-gray-100 px-3 py-3">
        <h4 className="text-xs font-semibold text-black">{tRuns('title')}</h4>
      </div>
      {runs.length === 0 ? (
        <p className="px-3 py-3 text-xs text-gray-500">{tRuns('empty')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {runs.map((run) => (
            <li key={run.id} className="px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-black">
                  {run.status}
                </span>
                <span className="text-[11px] text-gray-500">
                  {formatRunTimestamp(run.createdAt, locale)}
                </span>
              </div>
              {run.message && <p className="mt-1 text-xs text-gray-500">{run.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
