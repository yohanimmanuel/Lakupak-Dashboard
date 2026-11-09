'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type SalesTeamSummary = {
  id: string;
  name: string;
  memberCount: number;
};

export type SalesSummary = {
  teams: SalesTeamSummary[];
  totalAgents: number;
  activeAgents: number;
};

type SalesWidgetProps = {
  salesSummary: SalesSummary | null;
};

export default function SalesWidget({ salesSummary }: SalesWidgetProps) {
  const t = useTranslations('dashboard.home.widgets.sales');
  const tCommon = useTranslations('dashboard.common');

  const summary = salesSummary ?? { teams: [], totalAgents: 0, activeAgents: 0 };
  const hasTeams = summary.teams.length > 0 || summary.totalAgents > 0;

  return (
    <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-black">{t('teamsAndPeople')}</h3>
        <Users className="h-4 w-4 text-gray-400" />
      </div>
      {hasTeams ? (
        <>
          <div className="grid grid-cols-1 gap-2 @xs:grid-cols-3">
            <div className="rounded bg-gray-50 p-2 text-center">
              <p className="text-lg font-semibold text-black">{summary.teams.length}</p>
              <p className="text-[10px] uppercase text-gray-500">{t('teams')}</p>
            </div>
            <div className="rounded bg-gray-50 p-2 text-center">
              <p className="text-lg font-semibold text-black">{summary.totalAgents}</p>
              <p className="text-[10px] uppercase text-gray-500">{t('agents')}</p>
            </div>
            <div className="rounded bg-emerald-50 p-2 text-center">
              <p className="text-lg font-semibold text-emerald-700">{summary.activeAgents}</p>
              <p className="text-[10px] uppercase text-emerald-600">{tCommon('active')}</p>
            </div>
          </div>
          {summary.teams.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {t('byTeam')}
              </p>
              <ul className="space-y-1.5">
                {summary.teams.slice(0, 4).map((team) => (
                  <li key={team.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-gray-800">{team.name}</span>
                    <span className="ml-2 shrink-0 rounded bg-[#f0f7ff] px-2 py-0.5 text-xs font-medium text-[#0a61d7]">
                      {team.memberCount}{' '}
                      {team.memberCount === 1 ? t('member') : t('members')}
                    </span>
                  </li>
                ))}
                {summary.teams.length > 4 && (
                  <li className="text-xs text-gray-500">
                    {summary.teams.length - 4 === 1
                      ? t('moreTeams', { count: summary.teams.length - 4 })
                      : t('moreTeamsPlural', { count: summary.teams.length - 4 })}
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Users className="mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">{t('noTeamsTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('noTeamsHint')}</p>
        </div>
      )}
    </div>
  );
}
