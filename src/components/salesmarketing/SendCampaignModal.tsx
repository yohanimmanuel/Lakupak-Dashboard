'use client';

import React, { useState } from 'react';
import { X, ArrowLeft, Send } from 'lucide-react';
import { Campaign } from '@/types/campaign';
import CampaignPreview from './CampaignPreview';
import { formatCampaignForWhatsApp, shareToWhatsApp } from '@/utils/campaignWhatsApp';
import { useUserStore } from '@/store/userStore';
import { getDefaultCurrency } from '@/utils/currencyUtils';

interface SendCampaignModalProps {
  open: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onSend?: (campaign: Campaign) => void;
}

export default function SendCampaignModal({
  open,
  onClose,
  campaign,
  onSend,
}: SendCampaignModalProps) {
  const [sending, setSending] = useState(false);
  const user = useUserStore((state) => state.user);
  const userCurrency = user?.currency || getDefaultCurrency();

  if (!open || !campaign) return null;

  const handleSend = async () => {
    if (!campaign) return;
    
    setSending(true);
    try {
      const message = formatCampaignForWhatsApp(campaign);
      
      shareToWhatsApp(message);
      
      if (onSend) {
      await onSend(campaign);
      }
      
      onClose();
    } catch (error) {
      // Handle error
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg border border-[#e6e6e6] w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header with white top bar, blue arrow button, and black title */}
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6e6] bg-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-black">Send Campaign</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          <div className="space-y-6">
            {/* Campaign Information */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-md font-semibold text-black mb-4">Campaign Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Campaign ID</label>
                  <p className="text-sm text-black">{campaign.campaignId}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Campaign Name</label>
                  <p className="text-sm text-black font-semibold">{campaign.name}</p>
                </div>
                {campaign.description && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <p className="text-sm text-black">{campaign.description}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Recipients</label>
                  <p className="text-sm text-black">{campaign.recipients}</p>
                </div>
              </div>
            </div>

            {/* Campaign Preview */}
            <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
              <h3 className="text-md font-semibold text-black mb-4">Campaign Design</h3>
              <div className="border border-[#e6e6e6] rounded-lg overflow-hidden">
                <CampaignPreview
                  campaign={campaign}
                  currency={userCurrency}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#e6e6e6] bg-white rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 font-semibold bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending...
              </>
            ) : (
              <>
                <img src="/whatsapp.svg" alt="WhatsApp" className="w-4 h-4" />
                Send Campaign
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
 