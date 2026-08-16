'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, UserRound, X } from 'lucide-react';
import BuyerTable from '@/components/clientmanagement/BuyerTable';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import type { Buyer, BuyerTableRow, OrderDetail } from '@/types/client';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

export type PickedBuyer = {
  buyerId: string;
  buyerLabel: string;
  buyerPhone: string;
};

const BUYERS_QUERY = `
  query GetBuyers($userId: Int!, $page: Int, $limit: Int) {
    buyers(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        buyerId
        avatar
        owner
        storeName
        email
        phone
        businessType
        address
        status
        logistics
        notes
        orderDetails
        avgMonthlySpending
        avgMonthlyOrders
        userId
        createdAt
        updatedAt
      }
      pagination {
        page
        limit
        totalCount
        totalPages
      }
    }
  }
`;

function formatDate(date?: Date | string | null) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function profileToTableRow(buyer: Buyer): BuyerTableRow {
  let totalSpend = 0;
  let outstanding = 0;
  const orderDetails = buyer.orderDetails
    ? (() => {
        try {
          return JSON.parse(buyer.orderDetails);
        } catch {
          return [];
        }
      })()
    : [];

  if (Array.isArray(orderDetails) && orderDetails.length > 0) {
    orderDetails.forEach((o: OrderDetail) => {
      totalSpend += parseInt((o.totalSpend || '').toString().replace(/[^\d]/g, '')) || 0;
    });
    outstanding = orderDetails.reduce(
      (sum: number, o: OrderDetail) =>
        sum + (parseInt((o.outstanding || '').toString().replace(/[^\d]/g, '')) || 0),
      0,
    );
  }

  return {
    id: buyer.id || 0,
    buyerId: buyer.buyerId,
    avatar: buyer.avatar,
    owner: buyer.owner,
    name: buyer.storeName,
    email: buyer.email,
    phone: buyer.phone,
    storeName: buyer.storeName,
    businessType: buyer.businessType,
    address: buyer.address,
    status: buyer.status,
    totalOrders: Array.isArray(orderDetails)
      ? orderDetails
          .reduce((sum: number, o: OrderDetail) => sum + (parseInt(o.totalOrders) || 0), 0)
          .toString()
      : '0',
    totalSpend: totalSpend.toString(),
    outstanding: outstanding.toString(),
    createdAt: formatDate(buyer.createdAt),
    lastUpdated: formatDate(buyer.updatedAt),
    userId: buyer.userId || 0,
  };
}

export function toPickedBuyer(buyer: Buyer): PickedBuyer {
  return {
    buyerId: buyer.buyerId,
    buyerLabel: buyer.storeName || buyer.owner,
    buyerPhone: buyer.phone,
  };
}

/** Prefer selectedBuyers[]; fall back to legacy single buyerId fields. */
export function normalizePickedBuyers(config: Record<string, unknown> | undefined): PickedBuyer[] {
  const list = config?.selectedBuyers;
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const buyerId = String(row.buyerId ?? '').trim();
        if (!buyerId) return null;
        return {
          buyerId,
          buyerLabel: String(row.buyerLabel ?? ''),
          buyerPhone: String(row.buyerPhone ?? ''),
        };
      })
      .filter((b): b is PickedBuyer => Boolean(b));
  }

  const buyerId = String(config?.buyerId ?? '').trim();
  if (!buyerId) return [];
  return [
    {
      buyerId,
      buyerLabel: String(config?.buyerLabel ?? ''),
      buyerPhone: String(config?.buyerPhone ?? ''),
    },
  ];
}

export function BuyerPickerField({
  label,
  selectedBuyers,
  onSelectAction,
  onClearAction,
}: {
  label: string;
  selectedBuyers: PickedBuyer[];
  onSelectAction: (buyers: Buyer[]) => void;
  onClearAction: () => void;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBuyers = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const allBuyers: Buyer[] = [];

      do {
        const data = await fetchGraphQL<{
          buyers: {
            nodes: Buyer[];
            pagination: {
              page: number;
              limit: number;
              totalCount: number;
              totalPages: number;
            };
          };
        }>(BUYERS_QUERY, {
          userId: user.id,
          page,
          limit: pageSize,
        });

        allBuyers.push(...(data.buyers.nodes ?? []));
        totalPages = Math.max(1, data.buyers.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);

      setBuyers(allBuyers);
    } catch (e) {
      setError(e instanceof Error ? e.message : tBuilder('buyerPickerLoadFailed'));
      setBuyers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tBuilder]);

  useEffect(() => {
    if (!open) return;
    void loadBuyers();
  }, [open, loadBuyers]);

  const hasSelection = selectedBuyers.length > 0;
  const summaryLabel = useMemo(() => {
    if (selectedBuyers.length === 0) return '';
    if (selectedBuyers.length === 1) {
      return selectedBuyers[0].buyerLabel || selectedBuyers[0].buyerId;
    }
    return tBuilder('buyerPickerSelectedCount', { count: selectedBuyers.length });
  }, [selectedBuyers, tBuilder]);

  const summaryPhone = useMemo(() => {
    if (selectedBuyers.length === 0) return '';
    if (selectedBuyers.length === 1) {
      return selectedBuyers[0].buyerPhone
        ? tBuilder('buyerPickerPhone', { phone: selectedBuyers[0].buyerPhone })
        : tBuilder('buyerPickerNoPhone');
    }
    const withPhone = selectedBuyers.filter((b) => b.buyerPhone.trim()).length;
    return tBuilder('buyerPickerPhonesReady', { count: withPhone, total: selectedBuyers.length });
  }, [selectedBuyers, tBuilder]);

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {hasSelection ? (
        <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5">
          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-black">{summaryLabel}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500">{summaryPhone}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[#0a61d7] hover:bg-[#f7faff]"
              >
                {tBuilder('buyerPickerChange')}
              </button>
              <button
                type="button"
                onClick={onClearAction}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                {tBuilder('buyerPickerClear')}
              </button>
            </div>
          </div>
          {selectedBuyers.length > 1 && (
            <ul className="space-y-1 border-t border-gray-100 pt-2">
              {selectedBuyers.slice(0, 5).map((buyer) => (
                <li key={buyer.buyerId} className="truncate text-[11px] text-gray-600">
                  <span className="font-medium text-black">{buyer.buyerLabel || buyer.buyerId}</span>
                  {buyer.buyerPhone ? ` · ${buyer.buyerPhone}` : ''}
                </li>
              ))}
              {selectedBuyers.length > 5 && (
                <li className="text-[11px] font-medium text-gray-400">
                  {tBuilder('buyerPickerAndMore')}
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5 text-xs font-semibold text-black hover:bg-gray-50"
        >
          <UserRound className="h-4 w-4 text-[#0a61d7]" />
          {tBuilder('buyerPickerOpen')}
        </button>
      )}

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
              aria-label={tBuilder('buyerPickerTitle')}
              className="flex max-h-[min(90dvh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-black">{tBuilder('buyerPickerTitle')}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">{tBuilder('buyerPickerHintMulti')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-1 rounded-lg p-1 text-gray-500 hover:bg-gray-50 hover:text-black"
                  aria-label={tBuilder('buyerPickerClose')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tBuilder('buyerPickerLoading')}
                  </div>
                ) : error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : (
                  <BuyerTable
                    buyers={buyers}
                    setBuyers={setBuyers}
                    profileToTableRow={profileToTableRow}
                    pickerMode
                    pickerConfirmLabel={tBuilder('buyerPickerConfirm')}
                    initialSelectedBuyerIds={selectedBuyers.map((b) => b.buyerId)}
                    onConfirmPickerSelection={(picked) => {
                      onSelectAction(picked);
                      setOpen(false);
                    }}
                    onRefresh={() => void loadBuyers()}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
