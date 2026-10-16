'use client';

import React, { useMemo } from 'react';
import { Workflow, PlayCircle, PauseCircle, FileEdit } from 'lucide-react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { AutomationWorkflowRow } from './automationTypes';
import {
  STAT_ICON_BG_BLUE,
  STAT_ICON_BG_GREEN,
  STAT_ICON_BLUE,
  STAT_ICON_GREEN,
} from '@/utils/statCardStyles';

type StatCardConfig = {
  key: string;
  label: string;
  count: number;
  hint: string;
  icon: React.ReactNode;
  iconBg: string;
};

function AutomationStatCard({ label, count, hint, icon, iconBg }: Omit<StatCardConfig, 'key'>) {
  return (
    <div className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6]">
      <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
          <div className="text-xl font-bold text-black">{count.toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-4 ml-1">
        <span className="inline-flex items-center rounded-md bg-[#f3f4f6] px-2 py-1 text-xs text-gray-500">
          {hint}
        </span>
      </div>
    </div>
  );
}

export default function AutomationStatcards({ workflows }: { workflows: AutomationWorkflowRow[] }) {
  const { tStats } = useAutomationTranslations();

  const stats = useMemo((): StatCardConfig[] => {
    const total = workflows.length;
    const active = workflows.filter((w) => w.status === 'active').length;
    const paused = workflows.filter((w) => w.status === 'paused').length;
    const draft = workflows.filter((w) => w.status === 'draft').length;

    const share = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

    return [
      {
        key: 'total',
        label: tStats('totalWorkflows'),
        count: total,
        hint: tStats('allWorkflows'),
        icon: <Workflow className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        iconBg: STAT_ICON_BG_BLUE,
      },
      {
        key: 'active',
        label: tStats('active'),
        count: active,
        hint: total > 0 ? tStats('shareOfTotal', { percent: share(active) }) : tStats('noWorkflows'),
        icon: <PlayCircle className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
        iconBg: STAT_ICON_BG_GREEN,
      },
      {
        key: 'paused',
        label: tStats('paused'),
        count: paused,
        hint: total > 0 ? tStats('shareOfTotal', { percent: share(paused) }) : tStats('noWorkflows'),
        icon: <PauseCircle className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        iconBg: STAT_ICON_BG_BLUE,
      },
      {
        key: 'draft',
        label: tStats('draft'),
        count: draft,
        hint: total > 0 ? tStats('shareOfTotal', { percent: share(draft) }) : tStats('noWorkflows'),
        icon: <FileEdit className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
        iconBg: STAT_ICON_BG_BLUE,
      },
    ];
  }, [workflows, tStats]);

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {stats.map((stat) => (
        <AutomationStatCard
          key={stat.key}
          label={stat.label}
          count={stat.count}
          hint={stat.hint}
          icon={stat.icon}
          iconBg={stat.iconBg}
        />
      ))}
    </div>
  );
}
