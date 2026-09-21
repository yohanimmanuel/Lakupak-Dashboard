'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Loader2, X } from 'lucide-react';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useUserStore } from '@/store/userStore';

export type PickedOffer = {
  offerId: string;
  offerLabel: string;
  offerStatus: string;
};

type OfferNode = {
  id: string;
  offerId: string;
  name: string;
  status: string;
};

const OFFERS_QUERY = `
  query GetAutomationOffers($userId: Int!, $page: Int, $limit: Int) {
    offers(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        offerId
        name
        status
      }
      pagination {
        totalPages
      }
    }
  }
`;

/** Prefer selectedOffers[]; fall back to legacy single offerId. */
export function normalizePickedOffers(
  config: Record<string, unknown> | undefined,
): PickedOffer[] {
  const list = config?.selectedOffers;
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const offerId = String(row.offerId ?? row.id ?? '').trim();
        if (!offerId) return null;
        return {
          offerId,
          offerLabel: String(row.offerLabel ?? row.name ?? ''),
          offerStatus: String(row.offerStatus ?? row.status ?? ''),
        };
      })
      .filter((o): o is PickedOffer => Boolean(o));
  }

  const offerId = String(config?.offerId ?? '').trim();
  if (!offerId) return [];
  return [
    {
      offerId,
      offerLabel: String(config?.offerLabel ?? ''),
      offerStatus: String(config?.offerStatus ?? ''),
    },
  ];
}

function toPicked(offer: OfferNode): PickedOffer {
  return {
    offerId: String(offer.offerId || offer.id),
    offerLabel: offer.name || offer.offerId || offer.id,
    offerStatus: String(offer.status ?? ''),
  };
}

export function OfferPickerField({
  label,
  selectedOffers,
  onSelectAction,
  onClearAction,
}: {
  label: string;
  selectedOffers: PickedOffer[];
  onSelectAction: (picked: PickedOffer[]) => void;
  onClearAction: () => void;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [offers, setOffers] = useState<OfferNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draftId, setDraftId] = useState<string | null>(selectedOffers[0]?.offerId ?? null);

  const loadOffers = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: OfferNode[] = [];
      do {
        const data = await fetchGraphQL<{
          offers: { nodes: OfferNode[]; pagination: { totalPages?: number } };
        }>(OFFERS_QUERY, { userId: user.id, page, limit: pageSize });
        all.push(...(data.offers?.nodes ?? []));
        totalPages = Math.max(1, data.offers?.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);
      setOffers(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : tBuilder('offerPickerLoadFailed'));
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tBuilder]);

  useEffect(() => {
    if (!open) return;
    setDraftId(selectedOffers[0]?.offerId ?? null);
    setSearch('');
    void loadOffers();
  }, [open, loadOffers, selectedOffers]);

  const selected = selectedOffers[0] ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((offer) => {
      const hay = `${offer.name} ${offer.offerId} ${offer.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [offers, search]);

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {selected ? (
        <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-black">
                {selected.offerLabel || selected.offerId}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500">
                {selected.offerStatus
                  ? tBuilder('offerPickerStatus', { status: selected.offerStatus })
                  : selected.offerId}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[#0a61d7] hover:bg-[#f7faff]"
              >
                {tBuilder('offerPickerChange')}
              </button>
              <button
                type="button"
                onClick={onClearAction}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                {tBuilder('offerPickerClear')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs font-semibold text-black hover:bg-gray-50"
        >
          <Gift className="h-4 w-4 text-[#0a61d7]" />
          {tBuilder('offerPickerOpen')}
        </button>
      )}
      <p className="mt-1 text-[11px] leading-snug text-gray-500">{tBuilder('offerPickerOptionalHint')}</p>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3 sm:p-6"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={tBuilder('offerPickerTitle')}
              className="flex max-h-[min(90dvh,40rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-black">{tBuilder('offerPickerTitle')}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">{tBuilder('offerPickerHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-1 rounded-lg p-1 text-gray-500 hover:bg-gray-50 hover:text-black"
                  aria-label={tBuilder('offerPickerClose')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tBuilder('offerPickerLoading')}
                  </div>
                ) : error ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadOffers()}
                      className="text-xs font-medium text-[#0a61d7] hover:underline"
                    >
                      {tBuilder('offerPickerRetry')}
                    </button>
                  </div>
                ) : offers.length === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-500">{tBuilder('offerPickerEmpty')}</p>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={tBuilder('offerPickerSearch')}
                      className="w-full rounded-lg border border-[#e6e6e6] px-3 py-2 text-xs text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
                    />
                    <ul className="divide-y divide-gray-100 rounded-lg border border-[#e6e6e6]">
                      {filtered.map((offer) => {
                        const picked = toPicked(offer);
                        const isOn = draftId === picked.offerId;
                        return (
                          <li key={offer.id}>
                            <button
                              type="button"
                              onClick={() => setDraftId(isOn ? null : picked.offerId)}
                              className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs hover:bg-gray-50 ${
                                isOn ? 'bg-[#f7faff]' : 'bg-white'
                              }`}
                            >
                              <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[#0a61d7]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-black">
                                  {picked.offerLabel}
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-gray-500">
                                  {picked.offerId}
                                  {picked.offerStatus ? ` · ${picked.offerStatus}` : ''}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {filtered.length === 0 ? (
                      <p className="text-center text-xs text-gray-500">{tBuilder('offerPickerNoMatches')}</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onClearAction();
                    setOpen(false);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  {tBuilder('offerPickerClear')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const picked = offers.map(toPicked).find((o) => o.offerId === draftId);
                    onSelectAction(picked ? [picked] : []);
                    setOpen(false);
                  }}
                  className="rounded-lg bg-[#0a61d7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#084ba6]"
                >
                  {tBuilder('offerPickerConfirm')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
