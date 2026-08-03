'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Megaphone, X } from 'lucide-react';
import CampaignTable from '@/components/salesmarketing/CampaignTable';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';
import { useUserStore } from '@/store/userStore';
import type { Campaign, CampaignTableRow } from '@/types/campaign';

export type PickedCampaign = {
  campaignId: string;
  campaignLabel: string;
  campaignStatus: string;
};

const CAMPAIGNS_QUERY = `
  query GetAutomationCampaigns($userId: Int!, $page: Int, $limit: Int) {
    campaigns(userId: $userId, page: $page, limit: $limit) {
      nodes {
        id
        campaignId
        name
        description
        status
        sentDate
        recipients
        opensCount
        clicksCount
        revenue
        orders
        contentBlocks
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

/** Prefer selectedCampaigns[]; fall back to legacy single campaignId fields. */
export function normalizePickedCampaigns(
  config: Record<string, unknown> | undefined,
): PickedCampaign[] {
  const list = config?.selectedCampaigns;
  if (Array.isArray(list)) {
    return list
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const campaignId = String(row.campaignId ?? '').trim();
        if (!campaignId) return null;
        return {
          campaignId,
          campaignLabel: String(row.campaignLabel ?? ''),
          campaignStatus: String(row.campaignStatus ?? ''),
        };
      })
      .filter((c): c is PickedCampaign => Boolean(c));
  }

  const campaignId = String(config?.campaignId ?? '').trim();
  if (!campaignId) return [];
  return [
    {
      campaignId,
      campaignLabel: String(config?.campaignLabel ?? ''),
      campaignStatus: String(config?.campaignStatus ?? ''),
    },
  ];
}

/** @deprecated Prefer normalizePickedCampaigns */
export function normalizePickedCampaign(
  config: Record<string, unknown> | undefined,
): PickedCampaign | null {
  return normalizePickedCampaigns(config)[0] ?? null;
}

function campaignToTableRow(campaign: Campaign): CampaignTableRow {
  return {
    id: campaign.id,
    campaignId: campaign.campaignId,
    name: campaign.name,
    status: campaign.status,
    sentDate: campaign.sentDate,
    recipients: campaign.recipients,
    opensCount: campaign.opensCount,
    clicksCount: campaign.clicksCount,
    revenue: campaign.revenue,
    orders: campaign.orders,
  };
}

function toPicked(campaign: Campaign): PickedCampaign {
  return {
    campaignId: String(campaign.campaignId || campaign.id),
    campaignLabel: campaign.name || campaign.campaignId || campaign.id,
    campaignStatus: String(campaign.status ?? ''),
  };
}

export function CampaignPickerField({
  label,
  selectedCampaigns,
  onSelectAction,
  onClearAction,
}: {
  label: string;
  selectedCampaigns: PickedCampaign[];
  onSelectAction: (picked: PickedCampaign[]) => void;
  onClearAction: () => void;
}) {
  const { tBuilder } = useAutomationTranslations();
  const user = useUserStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const all: Campaign[] = [];
      do {
        const data = await fetchGraphQL<{
          campaigns: { nodes: Campaign[]; pagination: { totalPages?: number } };
        }>(CAMPAIGNS_QUERY, { userId: user.id, page, limit: pageSize });
        all.push(...(data.campaigns?.nodes ?? []));
        totalPages = Math.max(1, data.campaigns?.pagination?.totalPages ?? 1);
        page += 1;
      } while (page <= totalPages);
      setCampaigns(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : tBuilder('campaignPickerLoadFailed'));
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tBuilder]);

  useEffect(() => {
    if (!open) return;
    void loadCampaigns();
  }, [open, loadCampaigns]);

  const hasSelection = selectedCampaigns.length > 0;
  const summaryLabel = useMemo(() => {
    if (selectedCampaigns.length === 0) return '';
    if (selectedCampaigns.length === 1) {
      return selectedCampaigns[0].campaignLabel || selectedCampaigns[0].campaignId;
    }
    return tBuilder('campaignPickerSelectedCount', { count: selectedCampaigns.length });
  }, [selectedCampaigns, tBuilder]);

  const summarySub = useMemo(() => {
    if (selectedCampaigns.length === 0) return '';
    if (selectedCampaigns.length === 1) {
      const c = selectedCampaigns[0];
      return c.campaignStatus
        ? tBuilder('campaignPickerStatus', { status: c.campaignStatus })
        : c.campaignId;
    }
    return tBuilder('campaignPickerSelectedHint', { count: selectedCampaigns.length });
  }, [selectedCampaigns, tBuilder]);

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {hasSelection ? (
        <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#0a61d7]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-black">{summaryLabel}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500">{summarySub}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-[#0a61d7] hover:bg-[#f7faff]"
              >
                {tBuilder('campaignPickerChange')}
              </button>
              <button
                type="button"
                onClick={onClearAction}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                {tBuilder('campaignPickerClear')}
              </button>
            </div>
          </div>
          {selectedCampaigns.length > 1 && (
            <ul className="space-y-1 border-t border-gray-100 pt-2">
              {selectedCampaigns.slice(0, 5).map((campaign) => (
                <li key={campaign.campaignId} className="truncate text-[11px] text-gray-600">
                  <span className="font-medium text-black">
                    {campaign.campaignLabel || campaign.campaignId}
                  </span>
                  {campaign.campaignStatus ? ` · ${campaign.campaignStatus}` : ''}
                </li>
              ))}
              {selectedCampaigns.length > 5 && (
                <li className="text-[11px] font-medium text-gray-400">
                  {tBuilder('campaignPickerAndMore')}
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
          <Megaphone className="h-4 w-4 text-[#0a61d7]" />
          {tBuilder('campaignPickerOpen')}
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
              aria-label={tBuilder('campaignPickerTitle')}
              className="flex max-h-[min(90dvh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-black">
                    {tBuilder('campaignPickerTitle')}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">{tBuilder('campaignPickerHintMulti')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-1 rounded-lg p-1 text-gray-500 hover:bg-gray-50 hover:text-black"
                  aria-label={tBuilder('campaignPickerClose')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tBuilder('campaignPickerLoading')}
                  </div>
                ) : error ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadCampaigns()}
                      className="text-xs font-medium text-[#0a61d7] hover:underline"
                    >
                      {tBuilder('campaignPickerRetry')}
                    </button>
                  </div>
                ) : (
                  <CampaignTable
                    campaigns={campaigns}
                    campaignToTableRow={campaignToTableRow}
                    onRefresh={() => void loadCampaigns()}
                    pickerMode
                    pickerSingleSelect={false}
                    pickerConfirmLabel={tBuilder('campaignPickerConfirm')}
                    initialSelectedCampaignIds={selectedCampaigns.map((c) => c.campaignId)}
                    onConfirmPickerSelection={(picked) => {
                      onSelectAction(picked.map(toPicked));
                      setOpen(false);
                    }}
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
