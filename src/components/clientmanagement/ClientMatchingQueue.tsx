'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

const CARD = 'bg-white rounded-lg border border-[#e6e6e6] p-4';

export default function ClientMatchingQueue() {
  const t = useTranslations('dashboard.clients.matching');
  const userId = useUserStore((state) => state.user?.id);
  const params = useSearchParams();
  const [queue, setQueue] = useState<'pending' | 'needs_more_info' | 'auto'>('pending');
  const [rows, setRows] = useState<Candidate[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(params?.get('buyerId') || '');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<OrderHit[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const [listResult, optionsResult] = await Promise.allSettled([
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
    ]);
    if (listResult.status === 'fulfilled') {
      setRows(listResult.value.clientMatchCandidates);
    }
    if (optionsResult.status === 'fulfilled') {
      setClients(optionsResult.value.salesJobFormOptions.clients.filter((client) => client.status === 'Prospect' || client.status === 'Active'));
    }
    const failure = listResult.status === 'rejected' ? listResult.reason : optionsResult.status === 'rejected' ? optionsResult.reason : null;
    if (failure) {
      setError(failure instanceof Error ? failure.message : 'Failed to load');
    }
  }, [userId, queue]);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [load]);

  const act = async (work: () => Promise<void>) => {
    setError('');
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const signalLabel = (signal: string) => t(`signals.${signal}` as 'signals.phone_match');

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <h1 className="text-2xl font-bold text-black">{t('title')}</h1>
      <p className="text-sm text-gray-600 mt-1 mb-4">{t('subtitle')}</p>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <section className={`${CARD} mb-4`}>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('searchLabel')}</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-xs text-gray-500">
            {t('prospect')}
            <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black" value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="" />
              {clients.map((client) => (
                <option key={client.buyerId} value={client.buyerId}>{client.storeName} ({client.status})</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500 md:col-span-2">
            {t('searchPlaceholder')}
            <div className="mt-1 flex gap-2">
              <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-black" value={query} placeholder={t('searchPlaceholder')} onChange={(event) => setQuery(event.target.value)} />
              <button className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg text-sm font-medium" onClick={() => act(async () => {
                const data = await fetchGraphQL<{ searchOrdersForClientMatch: OrderHit[] }>(
                  `query Search($userId: Int!, $query: String!) { searchOrdersForClientMatch(userId: $userId, query: $query) { orderId storeName contactPerson contactPhone deliveryAddress orderDate } }`,
                  { userId, query },
                );
                setHits(data.searchOrdersForClientMatch);
              })}>{t('search')}</button>
            </div>
          </label>
        </div>
        <div className="mt-3 space-y-2">
          {hits.map((hit) => (
            <div key={hit.orderId} className="flex flex-wrap items-center justify-between gap-2 border border-[#e6e6e6] rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{hit.storeName}</p>
                <p className="text-xs text-gray-500">{hit.contactPerson} · {hit.contactPhone}</p>
                <p className="text-xs text-gray-500">{hit.deliveryAddress}</p>
              </div>
              <button
                className="px-3 py-1.5 bg-[#0a61d7] text-white rounded-lg text-xs font-medium disabled:opacity-50"
                disabled={!clientId}
                onClick={() => act(async () => {
                  await fetchGraphQL(
                    `mutation Merge($userId: Int!, $existingClientId: String!, $incomingOrderId: String!) { manualMergeClient(userId: $userId, existingClientId: $existingClientId, incomingOrderId: $incomingOrderId) }`,
                    { userId, existingClientId: clientId, incomingOrderId: hit.orderId },
                  );
                  setHits((prev) => prev.filter((row) => row.orderId !== hit.orderId));
                })}
              >
                {t('mergeInto')}
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-2 mb-4">
        {([
          ['pending', t('pending')],
          ['needs_more_info', t('needsInfo')],
          ['auto', t('autoMerged')],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setQueue(key)} className={`px-3 py-2 rounded-lg text-sm font-medium ${queue === key ? 'bg-[#0a61d7] text-white' : 'bg-white border border-gray-300 text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 && <p className="text-sm text-gray-500 text-center py-4">{t('empty')}</p>}
      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className={`${CARD} ${row.status === 'needs_more_info' ? 'border-amber-300' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-gray-900">{t('score', { score: row.confidenceScore })}</p>
              <div className="flex flex-wrap gap-1">
                {row.matchedSignals.map((signal) => (
                  <span key={signal} className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-[#e8f0fe] text-[#0a61d7]">{signalLabel(signal)}</span>
                ))}
                {row.status === 'needs_more_info' && (
                  <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-600">{t('needsInfo')}</span>
                )}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="border border-[#e6e6e6] rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{t('existing')}</p>
                <p className="text-sm font-medium text-gray-900">{row.existing.name}</p>
                <p className="text-xs text-gray-600">{row.existing.owner}</p>
                <p className="text-xs text-gray-600">{row.existing.phone}</p>
                <p className="text-xs text-gray-600">{row.existing.address}</p>
                {row.existing.status && <p className="text-xs font-semibold text-gray-700 mt-1">{row.existing.status}</p>}
              </div>
              <div className="border border-[#e6e6e6] rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{t('incoming')}</p>
                <p className="text-sm font-medium text-gray-900">{row.incoming.name}</p>
                <p className="text-xs text-gray-600">{row.incoming.owner}</p>
                <p className="text-xs text-gray-600">{row.incoming.phone}</p>
                <p className="text-xs text-gray-600">{row.incoming.address}</p>
                <p className="text-xs text-gray-500 mt-1">{row.incomingOrderId}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {queue !== 'auto' && (
                <>
                  <button className="px-3 py-1.5 bg-[#0a61d7] text-white rounded-lg text-xs font-medium" onClick={() => act(() => fetchGraphQL(`mutation Resolve($userId: Int!, $id: String!, $action: String!) { resolveClientMatch(userId: $userId, id: $id, action: $action) }`, { userId, id: row.id, action: 'merge' }).then(() => undefined))}>{t('merge')}</button>
                  <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs" onClick={() => act(() => fetchGraphQL(`mutation Resolve($userId: Int!, $id: String!, $action: String!) { resolveClientMatch(userId: $userId, id: $id, action: $action) }`, { userId, id: row.id, action: 'not_a_match' }).then(() => undefined))}>{t('notMatch')}</button>
                  <button className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg text-xs" onClick={() => act(() => fetchGraphQL(`mutation Resolve($userId: Int!, $id: String!, $action: String!) { resolveClientMatch(userId: $userId, id: $id, action: $action) }`, { userId, id: row.id, action: 'needs_more_info' }).then(() => undefined))}>{t('needsMore')}</button>
                </>
              )}
              {queue === 'auto' && (
                <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium" onClick={() => act(() => fetchGraphQL(`mutation Undo($userId: Int!, $id: String!) { undoClientMatch(userId: $userId, id: $id) }`, { userId, id: row.id }).then(() => undefined))}>{t('undo')}</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
