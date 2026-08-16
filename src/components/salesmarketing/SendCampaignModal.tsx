'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { Campaign } from '@/types/campaign';
import CampaignPreview from './CampaignPreview';
import { formatCampaignsForWhatsApp, shareToWhatsApp } from '@/utils/campaignWhatsApp';
import { useUserStore } from '@/store/userStore';
import { getDefaultCurrency } from '@/utils/currencyUtils';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';
import {
  BuyerPickerField,
  toPickedBuyer,
  type PickedBuyer,
} from '@/components/automations/builder/BuyerPickerField';
import { BuilderSelect } from '@/components/automations/builder/BuilderSelect';
import type { Buyer } from '@/types/client';

type SendChannel = 'whatsapp' | 'email' | 'both';

interface SendCampaignModalProps {
  open: boolean;
  onClose: () => void;
  campaign?: Campaign | null;
  campaigns?: Campaign[];
  onSend?: (campaign: Campaign, channel: SendChannel) => void | Promise<void>;
}

async function postCampaignEmail(
  campaign: Campaign,
  buyerIds: string[],
  fallbackError: string,
): Promise<void> {
  const response = await fetch('/api/marketing/campaigns/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: campaign.id || campaign.campaignId,
      buyerIds,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    fatal?: string;
    unattempted?: number;
  };
  if (!response.ok) {
    throw new Error(payload.error || fallbackError);
  }
  if (payload.fatal || (payload.unattempted ?? 0) > 0) {
    throw new Error(payload.fatal || payload.error || fallbackError);
  }
}

export default function SendCampaignModal({
  open,
  onClose,
  campaign = null,
  campaigns,
  onSend,
}: SendCampaignModalProps) {
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<SendChannel>('whatsapp');
  const [buyers, setBuyers] = useState<PickedBuyer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const user = useUserStore((state) => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();
  const { tSendModal } = useMarketingTranslations();

  const toSend = useMemo(() => {
    if (campaigns && campaigns.length > 0) return campaigns;
    return campaign ? [campaign] : [];
  }, [campaign, campaigns]);
  const sendKey = toSend.map((item) => item.id || item.campaignId).join(',');

  const needsBuyers = channel === 'email' || channel === 'both';
  const canSend = useMemo(() => {
    if (toSend.length === 0) return false;
    if (needsBuyers && buyers.length === 0) return false;
    return true;
  }, [toSend.length, needsBuyers, buyers.length]);

  useEffect(() => {
    if (!open) return;
    setChannel('whatsapp');
    setBuyers([]);
    setError(null);
    setSending(false);
  }, [open, sendKey]);

  if (!open || toSend.length === 0) return null;

  const handleSend = async () => {
    if (!canSend) return;

    setSending(true);
    setError(null);
    try {
      // One WhatsApp window per click: put every selected campaign in a single message.
      if (channel === 'whatsapp' || channel === 'both') {
        const message = formatCampaignsForWhatsApp(toSend);
        const phones = [
          ...new Set(buyers.map((buyer) => buyer.buyerPhone.trim()).filter(Boolean)),
        ];
        if (phones.length === 0) {
          shareToWhatsApp(message);
        } else {
          for (const phone of phones) {
            shareToWhatsApp(message, phone);
          }
        }
      }

      const buyerIds = buyers.map((b) => b.buyerId);
      const sent: Campaign[] = [];
      const emailErrors: string[] = [];
      if (channel === 'email' || channel === 'both') {
        for (const item of toSend) {
          try {
            await postCampaignEmail(item, buyerIds, tSendModal('emailFailed'));
            sent.push(item);
          } catch (err) {
            const detail = err instanceof Error ? err.message : tSendModal('emailFailed');
            emailErrors.push(toSend.length > 1 ? `${item.name}: ${detail}` : detail);
          }
        }
      } else {
        sent.push(...toSend);
      }

      for (const item of sent) {
        if (onSend) await onSend(item, channel);
      }

      if (emailErrors.length > 0) {
        throw new Error(emailErrors.join(' '));
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tSendModal('emailFailed'));
    } finally {
      setSending(false);
    }
  };

  const title =
    toSend.length > 1 && tSendModal.has('titleMultiple')
      ? tSendModal('titleMultiple')
      : tSendModal('title');
  const sendLabel =
    toSend.length > 1 && tSendModal.has('sendCampaigns')
      ? tSendModal('sendCampaigns')
      : tSendModal('sendCampaign');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg border border-[#e6e6e6] w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6] bg-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-black">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={tSendModal('closeModal')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-md font-semibold text-black mb-4">{tSendModal('campaignInformation')}</h3>
              <div className="space-y-3">
                {toSend.length === 1 ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{tSendModal('campaignId')}</label>
                      <p className="text-sm text-black">{toSend[0].campaignId}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{tSendModal('campaignName')}</label>
                      <p className="text-sm text-black font-semibold">{toSend[0].name}</p>
                    </div>
                    {toSend[0].description && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{tSendModal('description')}</label>
                        <p className="text-sm text-black">{toSend[0].description}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {tSendModal.has('selectedCampaigns')
                        ? tSendModal('selectedCampaigns')
                        : tSendModal('campaignName')}
                    </label>
                    <ul className="space-y-1">
                      {toSend.map((item) => (
                        <li key={item.id || item.campaignId} className="text-sm text-black">
                          <span className="font-semibold">{item.name}</span>
                          <span className="text-gray-500"> · {item.campaignId}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tSendModal('channel')}</label>
                  <BuilderSelect
                    aria-label={tSendModal('channel')}
                    value={channel}
                    options={[
                      { value: 'whatsapp', label: tSendModal('channelWhatsapp') },
                      { value: 'email', label: tSendModal('channelEmail') },
                      { value: 'both', label: tSendModal('channelBoth') },
                    ]}
                    onChangeAction={(next) => setChannel(next as SendChannel)}
                  />
                </div>
                {needsBuyers && (
                  <>
                    <BuyerPickerField
                      label={tSendModal('selectBuyers')}
                      selectedBuyers={buyers}
                      onSelectAction={(picked: Buyer[]) => setBuyers(picked.map(toPickedBuyer))}
                      onClearAction={() => setBuyers([])}
                    />
                    <p className="text-xs text-gray-500">{tSendModal('emailHint')}</p>
                  </>
                )}
                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-md font-semibold text-black mb-4">{tSendModal('campaignDesign')}</h3>
              <div className="space-y-3">
                {toSend.map((item) => (
                  <div key={item.id || item.campaignId}>
                    {toSend.length > 1 ? (
                      <p className="mb-2 text-sm font-semibold text-black">{item.name}</p>
                    ) : null}
                    <div className="border border-[#e6e6e6] rounded-lg overflow-hidden">
                      <CampaignPreview campaign={item} currency={userCurrency} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#e6e6e6] bg-white rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
          >
            {tSendModal('cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !canSend}
            className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {tSendModal('sending')}
              </>
            ) : (
              <>
                {channel === 'email' ? (
                  <Mail className="w-4 h-4" />
                ) : channel === 'whatsapp' ? (
                  <img src="/whatsapp.svg" alt={tSendModal('whatsappAlt')} className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sendLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
