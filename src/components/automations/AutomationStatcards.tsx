'use client';

import React, { useMemo } from 'react';
import { Workflow, PlayCircle, PauseCircle, FileEdit } from 'lucide-react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { AutomationWorkflow } from './automationTypes';

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
      <div className="flex items-center gap-2 mt-4 ml-1">
        <span className="text-gray-400 text-xs">{hint}</span>
      </div>
    </div>
  );
}

export default function AutomationStatcards({ workflows }: { workflows: AutomationWorkflow[] }) {
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
        icon: <Workflow className="w-6 h-6 text-[#0a61d7]" />,
        iconBg: 'bg-[#f7faff]',
      },
      {
        key: 'active',
        label: tStats('active'),
        count: active,
        hint: total > 0 ? tStats('shareOfTotal', { percent: share(active) }) : tStats('noWorkflows'),
        icon: <PlayCircle className="w-6 h-6 text-[#059669]" />,
        iconBg: 'bg-[#e6f7ec]',
      },
      {
        key: 'paused',
        label: tStats('paused'),
        count: paused,
        hint: total > 0 ? tStats('shareOfTotal', { percent: share(paused) }) : tStats('noWorkflows'),
        icon: <PauseCircle className="w-6 h-6 text-[#d97706]" />,
        iconBg: 'bg-[#fff4e6]',
      },
      {
        key: 'draft',
        label: tStats('draft'),
        count: draft,
        hint: total > 0 ? tStats('shareOfTotal', { percent: share(draft) }) : tStats('noWorkflows'),
        icon: <FileEdit className="w-6 h-6 text-gray-500" />,
        iconBg: 'bg-[#f2f2f2]',
      },
    ];
  }, [workflows, tStats]);

  return (
    <div className="w-full mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
