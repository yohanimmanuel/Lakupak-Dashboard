'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, Search, UserX, Users } from 'lucide-react';
import { STAT_ICON_BG_BLUE, STAT_ICON_BG_GREEN, STAT_ICON_BLUE, STAT_ICON_GREEN } from '@/utils/statCardStyles';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

type Side = { name: string; owner?: string | null; phone?: string | null; address?: string | null; status?: string | null };

type Candidate = {
  id: string;
  existingClientId: string;
  incomingOrderId: string;
  confidenceScore: number;
  matchedSignals: string[];
  status: string;
  createdAt: string;
  existing: Side;
  incoming: Side;
};

type QueueCounts = { pending: number; needsMoreInfo: number; notAMatch: number; recentlyMerged: number };

const TABS = ['all', 'pending', 'needs_more_info', 'not_a_match', 'auto'] as const;
const PAGE_SIZE = 5;
const EMPTY_COUNTS: QueueCounts = { pending: 0, needsMoreInfo: 0, notAMatch: 0, recentlyMerged: 0 };

function confidenceScoreClass(score: number): string {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-lime-600';
  if (score >= 25) return 'text-orange-600';
  return 'text-red-600';
}

function existingBuyerStatus(row: Candidate): string | null {
  if (row.incoming.status && row.incoming.status !== 'Prospect') return row.incoming.status;
  return null;
}

function cardEdgeClass(status: string): string {
  if (status === 'needs_more_info') return 'border-l-4 border-l-amber-400';
  if (status === 'not_a_match') return 'border-l-4 border-l-red-500';
  if (status === 'merged') return 'border-l-4 border-l-green-500';
  return '';
}
const CARD = 'bg-white rounded-lg border border-[#e6e6e6] p-4';
const INPUT =
  'w-full px-3 py-2 text-xs text-black border border-[#e6e6e6] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] bg-white';
const PRIMARY = 'px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold text-sm hover:bg-[#084ba6] transition-colors disabled:opacity-50';
const OUTLINE = 'px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium text-sm hover:bg-gray-100 transition-colors';

const STATUS_BADGE: Record<string, string> = {
  Prospect: 'bg-gray-100 text-gray-700',
  Active: 'bg-green-100 text-green-800',
  Inactive: 'bg-amber-100 text-amber-800',
  Blocked: 'bg-red-100 text-red-700',
};

function MatchListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-lg border border-[#e6e6e6] p-4">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-28" />
            <div className="flex gap-1">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xs text-black mt-0.5 break-words">{text}</p>
    </div>
  );
}

function rowMatches(row: Candidate, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    row.existing.name,
    row.existing.owner,
    row.existing.phone,
    row.existing.address,
    row.incoming.name,
    row.incoming.owner,
    row.incoming.phone,
    row.incoming.address,
  ];
  if (parts.some((part) => (part ?? '').toLowerCase().includes(needle))) return true;
  const digits = needle.replace(/\D/g, '');
  if (digits.length < 3) return false;
  return [row.existing.phone, row.incoming.phone].some((phone) => (phone ?? '').replace(/\D/g, '').includes(digits));
}

export default function ClientMatchingQueue() {
  const t = useTranslations('dashboard.clients.matching');
  const { translateStatus, tShared } = useClientsTranslations();
  const userId = useUserStore((state) => state.user?.id);
  const [queue, setQueue] = useState<(typeof TABS)[number]>('pending');
  const [rows, setRows] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<QueueCounts>(EMPTY_COUNTS);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [autoMatch, setAutoMatch] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const load = useCallback(async () => {
    if (!userId) return;
    setListLoading(true);
    try {
      const [listResult, countsResult, settingsResult] = await Promise.allSettled([
      fetchGraphQL<{ clientMatchCandidates: Candidate[] }>(
        `query Matches($userId: Int!, $queue: String) {
          clientMatchCandidates(userId: $userId, queue: $queue) {
            id existingClientId incomingOrderId confidenceScore matchedSignals status createdAt
            existing { name owner phone address status }
            incoming { name owner phone address status }
          }
        }`,
        { userId, queue },
      ),
      fetchGraphQL<{ clientMatchQueueCounts: QueueCounts }>(
        `query Counts($userId: Int!) {
          clientMatchQueueCounts(userId: $userId) { pending needsMoreInfo notAMatch recentlyMerged }
        }`,
        { userId },
      ),
      fetchGraphQL<{ clientMatchSettings: { autoMatch: boolean } }>(
        `query MatchSettings($userId: Int!) { clientMatchSettings(userId: $userId) { autoMatch } }`,
        { userId },
      ),
    ]);
      if (listResult.status === 'fulfilled') {
        setRows(listResult.value.clientMatchCandidates);
      }
      if (countsResult.status === 'fulfilled') {
        setCounts(countsResult.value.clientMatchQueueCounts);
      }
      if (settingsResult.status === 'fulfilled') {
        setAutoMatch(settingsResult.value.clientMatchSettings.autoMatch);
      }
      const failure = listResult.status === 'rejected' ? listResult.reason : countsResult.status === 'rejected' ? countsResult.reason : settingsResult.status === 'rejected' ? settingsResult.reason : null;
      if (failure) {
        setError(failure instanceof Error ? failure.message : 'Failed to load');
      }
    } finally {
      setListLoading(false);
    }
  }, [userId, queue]);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  useLayoutEffect(() => {
    const idx = TABS.findIndex((tab) => tab === queue);
    const node = tabRefs.current[idx];
    if (node) setIndicatorStyle({ left: node.offsetLeft, width: node.offsetWidth });
  }, [queue]);

  const act = async (work: () => Promise<void>) => {
    setError('');
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const undoMatch = (id: string) => {
    setError('');
    setListLoading(true);
    fetchGraphQL(
      `mutation Undo($userId: Int!, $id: String!) { undoClientMatch(userId: $userId, id: $id) }`,
      { userId, id },
    )
      .then(() => {
        setQueue('pending');
        setPage(1);
      })
      .catch((err: unknown) => {
        setListLoading(false);
        setError(err instanceof Error ? err.message : 'Request failed');
      });
  };

  const signalLabel = (signal: string) => t(`signals.${signal}` as 'signals.phone_match');
  const tabLabel = (tab: (typeof TABS)[number]) => {
    if (tab === 'all') return t('all');
    if (tab === 'pending') return t('pending');
    if (tab === 'needs_more_info') return t('needsInfo');
    if (tab === 'not_a_match') return t('notMatch');
    return t('autoMerged');
  };
  const statusLabel = (status: string) => translateStatus(status);
  const visibleRows = useMemo(() => rows.filter((row) => rowMatches(row, query)), [rows, query]);
  const totalRows = visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const fromRow = totalRows === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const toRow = Math.min(safePage * PAGE_SIZE, totalRows);
  const statCards: { key: string; label: string; count: number; hint: string; icon: React.ReactNode; iconBg: string }[] = [
    {
      key: 'pending',
      label: t('pending'),
      count: counts.pending,
      hint: t('statsPendingHint'),
      icon: <Clock className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
      iconBg: STAT_ICON_BG_BLUE,
    },
    {
      key: 'needs_more_info',
      label: t('needsInfo'),
      count: counts.needsMoreInfo,
      hint: t('statsNeedsHint'),
      icon: <ClipboardList className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
      iconBg: STAT_ICON_BG_BLUE,
    },
    {
      key: 'not_a_match',
      label: t('notMatch'),
      count: counts.notAMatch,
      hint: t('statsNotMatchHint'),
      icon: <UserX className={`w-6 h-6 ${STAT_ICON_BLUE}`} />,
      iconBg: STAT_ICON_BG_BLUE,
    },
    {
      key: 'auto',
      label: t('autoMerged'),
      count: counts.recentlyMerged,
      hint: t('statsMergedHint'),
      icon: <CheckCircle2 className={`w-6 h-6 ${STAT_ICON_GREEN}`} />,
      iconBg: STAT_ICON_BG_GREEN,
    },
  ];

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-black mb-2">{t('title')}</h1>
          <p className="text-sm text-gray-600">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoMatch}
          className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-sm font-medium text-black hover:bg-gray-100 shrink-0"
          onClick={() =>
            act(async () => {
              const next = !autoMatch;
              const data = await fetchGraphQL<{ updateClientMatchSettings: { autoMatch: boolean } }>(
                `mutation SetAutoMatch($userId: Int!, $autoMatch: Boolean!) { updateClientMatchSettings(userId: $userId, autoMatch: $autoMatch) { autoMatch } }`,
                { userId, autoMatch: next },
              );
              setAutoMatch(data.updateClientMatchSettings.autoMatch);
            })
          }
        >
          {t('autoMatch')}
          <span className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 ${autoMatch ? 'bg-[#0a61d7]' : 'bg-gray-300'}`}>
            <span className={`h-4 w-4 rounded-full bg-white transition-transform ${autoMatch ? 'translate-x-4' : 'translate-x-0'}`} />
          </span>
          <span className="text-xs text-gray-500">{autoMatch ? t('autoMatchOn') : t('autoMatchOff')}</span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-1 gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.key} className="flex flex-col justify-between p-4 rounded-lg bg-white border border-[#e6e6e6]">
            <div className="flex items-center gap-4 border-b border-[#e6e6e6] pb-4">
              <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${card.iconBg}`}>{card.icon}</div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{card.label}</div>
                <div className="text-xl font-bold text-black">{card.count.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-4 ml-1">
              <span className="inline-flex items-center rounded-md bg-[#f3f4f6] px-2 py-1 text-xs text-gray-500">{card.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={CARD}>
        <div className="relative w-full flex items-center overflow-x-auto mb-4">
          <div className="flex w-max bg-gray-100 rounded-lg overflow-hidden relative">
            <div
              className="absolute top-0 h-full transition-all duration-300"
              style={{ left: indicatorStyle.left, width: indicatorStyle.width, background: '#0a61d7', borderRadius: '0.75rem', zIndex: 1 }}
            />
            {TABS.map((tab, idx) => (
              <button
                key={tab}
                type="button"
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                onClick={() => {
                  setQueue(tab);
                  setPage(1);
                }}
                className={`relative z-10 px-4 py-2 font-medium text-[14px] transition-colors duration-200 focus:outline-none whitespace-nowrap ${
                  queue === tab ? 'text-white' : 'text-gray-700 hover:text-[#0a61d7]'
                } ${idx === 0 ? 'rounded-l-lg' : idx === TABS.length - 1 ? 'rounded-r-lg' : ''}`}
                style={{ background: 'transparent' }}
              >
                {tabLabel(tab)}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mb-4">
          <input
            id="match-search"
            className={`${INPUT} pl-10`}
            value={query}
            placeholder={t('searchPlaceholder')}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <Search className="absolute left-3 top-2 text-gray-400 w-4 h-4" />
        </div>

        {listLoading ? (
          <MatchListSkeleton />
        ) : visibleRows.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium">{t('empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pagedRows.map((row) => (
              <article
                key={row.id}
                className={`rounded-lg border border-[#e6e6e6] p-4 ${cardEdgeClass(row.status)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-sm font-semibold text-black">
                    {t.rich('score', {
                      score: row.confidenceScore,
                      n: (chunks) => <span className={`font-bold ${confidenceScoreClass(row.confidenceScore)}`}>{chunks}</span>,
                    })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {row.matchedSignals.map((signal) => (
                      <span key={signal} className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {signalLabel(signal)}
                      </span>
                    ))}
                    {row.status === 'needs_more_info' && (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">{t('needsInfo')}</span>
                    )}
                    {row.status === 'not_a_match' && (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">{t('notMatch')}</span>
                    )}
                    {row.status === 'merged' && (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">{t('merged')}</span>
                    )}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="border border-[#e6e6e6] rounded-lg p-4 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('prospect')}</p>
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-black">{row.existing.name}</p>
                        {row.existing.status === 'Prospect' && (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE.Prospect}`}>
                            {statusLabel(row.existing.status)}
                          </span>
                        )}
                      </div>
                      <Field label={t('owner')} value={row.existing.owner} />
                      <Field label={t('phone')} value={row.existing.phone} />
                      <Field label={t('address')} value={row.existing.address} />
                    </div>
                  </div>
                  <div className="border border-[#e6e6e6] rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('existing')}</p>
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-black">{row.incoming.name}</p>
                        {existingBuyerStatus(row) && (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[existingBuyerStatus(row) as string] || STATUS_BADGE.Active}`}>
                            {statusLabel(existingBuyerStatus(row) as string)}
                          </span>
                        )}
                      </div>
                      <Field label={t('owner')} value={row.incoming.owner} />
                      <Field label={t('phone')} value={row.incoming.phone} />
                      <Field label={t('address')} value={row.incoming.address} />
                      {row.incomingOrderId ? <Field label={t('orderId')} value={row.incomingOrderId} /> : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 mt-4">
                  {(row.status === 'pending' || row.status === 'needs_more_info') && row.incomingOrderId ? (
                    <>
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={() =>
                          act(() =>
                            fetchGraphQL(
                              `mutation Resolve($userId: Int!, $id: String!, $action: String!) { resolveClientMatch(userId: $userId, id: $id, action: $action) }`,
                              { userId, id: row.id, action: 'merge' },
                            ).then(() => undefined),
                          )
                        }
                      >
                        {t('merge')}
                      </button>
                      <button
                        type="button"
                        className={OUTLINE}
                        onClick={() =>
                          act(() =>
                            fetchGraphQL(
                              `mutation Resolve($userId: Int!, $id: String!, $action: String!) { resolveClientMatch(userId: $userId, id: $id, action: $action) }`,
                              { userId, id: row.id, action: 'not_a_match' },
                            ).then(() => undefined),
                          )
                        }
                      >
                        {t('notMatch')}
                      </button>
                      <button
                        type="button"
                        className={OUTLINE}
                        onClick={() =>
                          act(() =>
                            fetchGraphQL(
                              `mutation Resolve($userId: Int!, $id: String!, $action: String!) { resolveClientMatch(userId: $userId, id: $id, action: $action) }`,
                              { userId, id: row.id, action: 'needs_more_info' },
                            ).then(() => undefined),
                          )
                        }
                      >
                        {t('needsMore')}
                      </button>
                    </>
                  ) : null}
                  {(row.status === 'merged' || row.status === 'not_a_match') && (
                    <button type="button" className={OUTLINE} onClick={() => undoMatch(row.id)}>
                      {t('undo')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {!listLoading && totalRows > 0 && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mt-6 gap-2">
            <div className="text-sm text-gray-500">
              {tShared('pagination.showing', { from: fromRow, to: toRow, total: totalRows })}
              {query.trim() && (
                <span className="ml-2 text-blue-600">{tShared('pagination.filteredFrom', { total: rows.length })}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                aria-label={tShared('previousPage')}
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={`px-3 py-2 rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    pageNum === safePage ? 'bg-[#0a61d7] text-white' : 'bg-white text-[#0a61d7] hover:bg-[#f7faff]'
                  }`}
                  onClick={() => setPage(pageNum)}
                  aria-label={`${pageNum}`}
                  aria-current={pageNum === safePage ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                aria-label={tShared('nextPage')}
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
