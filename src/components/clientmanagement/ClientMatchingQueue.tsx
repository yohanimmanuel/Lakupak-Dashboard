'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, Search, Users } from 'lucide-react';
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

type OrderHit = {
  orderId: string;
  storeName: string;
  contactPerson: string;
  contactPhone: string;
  deliveryAddress: string;
  orderDate: string;
};

type ClientOption = { buyerId: string; storeName: string; status: string };

const TABS = ['pending', 'needs_more_info', 'not_a_match', 'auto'] as const;

function isMarketplaceBuyerId(buyerId: string): boolean {
  return /^LKB-\d+-\d+$/.test(buyerId) || buyerId.startsWith('mobile_user_');
}

function confidenceScoreClass(score: number): string {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-lime-600';
  if (score >= 25) return 'text-orange-600';
  return 'text-red-600';
}

function cardEdgeClass(status: string): string {
  if (status === 'needs_more_info') return 'border-l-4 border-l-amber-400';
  if (status === 'not_a_match') return 'border-l-4 border-l-red-500';
  if (status === 'merged') return 'border-l-4 border-l-green-500';
  return '';
}
const CARD = 'bg-white rounded-lg border border-[#e6e6e6] p-4';
const LABEL = 'block text-xs font-medium text-gray-700 mb-2';
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

function ProspectSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full px-3 py-2 text-xs border border-[#e6e6e6] rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-100"
      >
        <span className={`truncate ${selected ? 'text-black' : 'text-gray-500'}`}>{selected?.label || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className={`w-full px-4 py-2 text-xs text-left hover:bg-gray-100 first:rounded-t-lg ${value === '' ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-500'}`}
          >
            {placeholder}
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full px-4 py-2 text-xs text-left hover:bg-gray-100 last:rounded-b-lg ${
                value === option.value ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientMatchingQueue() {
  const t = useTranslations('dashboard.clients.matching');
  const { translateStatus } = useClientsTranslations();
  const userId = useUserStore((state) => state.user?.id);
  const params = useSearchParams();
  const [queue, setQueue] = useState<(typeof TABS)[number]>('pending');
  const [rows, setRows] = useState<Candidate[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(params?.get('buyerId') || '');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<OrderHit[]>([]);
  const [error, setError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [autoMatch, setAutoMatch] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const load = useCallback(async () => {
    if (!userId) return;
    setListLoading(true);
    try {
      const [listResult, optionsResult, settingsResult] = await Promise.allSettled([
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
      fetchGraphQL<{ salesJobFormOptions: { clients: ClientOption[] } }>(
        `query Clients($userId: Int!) { salesJobFormOptions(userId: $userId) { clients { buyerId storeName status } } }`,
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
      if (optionsResult.status === 'fulfilled') {
        setClients(
          optionsResult.value.salesJobFormOptions.clients.filter(
            (client) => (client.status === 'Prospect' || client.status === 'Active') && !isMarketplaceBuyerId(client.buyerId),
          ),
        );
      }
      if (settingsResult.status === 'fulfilled') {
        setAutoMatch(settingsResult.value.clientMatchSettings.autoMatch);
      }
      const failure = listResult.status === 'rejected' ? listResult.reason : optionsResult.status === 'rejected' ? optionsResult.reason : settingsResult.status === 'rejected' ? settingsResult.reason : null;
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
      })
      .catch((err: unknown) => {
        setListLoading(false);
        setError(err instanceof Error ? err.message : 'Request failed');
      });
  };

  const signalLabel = (signal: string) => t(`signals.${signal}` as 'signals.phone_match');
  const tabLabel = (tab: (typeof TABS)[number]) => {
    if (tab === 'pending') return t('pending');
    if (tab === 'needs_more_info') return t('needsInfo');
    if (tab === 'not_a_match') return t('notMatch');
    return t('autoMerged');
  };
  const statusLabel = (status: string) => translateStatus(status);

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
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

      <section className={`${CARD} mb-4`}>
        <h2 className="text-sm font-semibold text-black mb-4">{t('searchLabel')}</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className={LABEL}>{t('prospect')}</label>
            <ProspectSelect
              value={clientId}
              placeholder={t('selectProspect')}
              options={clients.map((client) => ({
                value: client.buyerId,
                label: `${client.storeName} (${statusLabel(client.status)})`,
              }))}
              onChange={setClientId}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="match-order-search">
              {t('orderLabel')}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="match-order-search"
                  className={`${INPUT} pl-10`}
                  value={query}
                  placeholder={t('searchPlaceholder')}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    void act(async () => {
                      const data = await fetchGraphQL<{ searchOrdersForClientMatch: OrderHit[] }>(
                        `query Search($userId: Int!, $query: String!) { searchOrdersForClientMatch(userId: $userId, query: $query) { orderId storeName contactPerson contactPhone deliveryAddress orderDate } }`,
                        { userId, query },
                      );
                      setHits(data.searchOrdersForClientMatch);
                    });
                  }}
                />
                <Search className="absolute left-3 top-2 text-gray-400 w-4 h-4" />
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold text-xs hover:bg-[#084ba6] transition-colors shrink-0"
                onClick={() =>
                  act(async () => {
                    const data = await fetchGraphQL<{ searchOrdersForClientMatch: OrderHit[] }>(
                      `query Search($userId: Int!, $query: String!) { searchOrdersForClientMatch(userId: $userId, query: $query) { orderId storeName contactPerson contactPhone deliveryAddress orderDate } }`,
                      { userId, query },
                    );
                    setHits(data.searchOrdersForClientMatch);
                  })
                }
              >
                {t('search')}
              </button>
            </div>
          </div>
        </div>
        {hits.length > 0 && (
          <div className="mt-4 space-y-2">
            {hits.map((hit) => (
              <div key={hit.orderId} className="flex flex-wrap items-center justify-between gap-3 border border-[#e6e6e6] rounded-lg p-4">
                <div className="grid sm:grid-cols-2 gap-3 min-w-0 flex-1">
                  <Field label={t('incoming')} value={hit.storeName} />
                  <Field label={t('owner')} value={hit.contactPerson} />
                  <Field label={t('phone')} value={hit.contactPhone} />
                  <Field label={t('address')} value={hit.deliveryAddress} />
                </div>
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={!clientId}
                  onClick={() =>
                    act(async () => {
                      await fetchGraphQL(
                        `mutation Merge($userId: Int!, $existingClientId: String!, $incomingOrderId: String!) { manualMergeClient(userId: $userId, existingClientId: $existingClientId, incomingOrderId: $incomingOrderId) }`,
                        { userId, existingClientId: clientId, incomingOrderId: hit.orderId },
                      );
                      setHits((prev) => prev.filter((row) => row.orderId !== hit.orderId));
                    })
                  }
                >
                  {t('mergeInto')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

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
                onClick={() => setQueue(tab)}
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

        {listLoading ? (
          <MatchListSkeleton />
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium">{t('empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('existing')}</p>
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-black">{row.existing.name}</p>
                        {row.existing.status && (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[row.existing.status] || STATUS_BADGE.Prospect}`}>
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('incoming')}</p>
                    <div className="grid gap-3">
                      <p className="text-sm font-semibold text-black">{row.incoming.name}</p>
                      <Field label={t('owner')} value={row.incoming.owner} />
                      <Field label={t('phone')} value={row.incoming.phone} />
                      <Field label={t('address')} value={row.incoming.address} />
                      <Field label={t('orderId')} value={row.incomingOrderId} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 mt-4">
                  {(queue === 'pending' || queue === 'needs_more_info') && (
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
                  )}
                  {(queue === 'auto' || queue === 'not_a_match') && (
                    <button type="button" className={OUTLINE} onClick={() => undoMatch(row.id)}>
                      {t('undo')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
