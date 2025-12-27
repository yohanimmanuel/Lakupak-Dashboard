'use client';

import React, { useState } from 'react';
import { X, ArrowLeft, Send } from 'lucide-react';
import { Campaign } from '@/types/campaign';
import WhatsAppCampaignBuilder from './WhatsAppCampaignBuilder';

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

  if (!open || !campaign) return null;

  const handleSend = async () => {
    if (!campaign || !onSend) return;
    
    setSending(true);
    try {
      await onSend(campaign);
      onClose();
    } catch (error) {
      // Handle error
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header with white top bar, blue arrow button, and black title */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
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
            <div className="bg-white rounded-lg border border-gray-200 p-4">
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
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                      campaign.status === 'Sent' || campaign.status === 'Completed'
                        ? 'bg-green-100 text-green-700'
                        : campaign.status === 'Scheduled'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {campaign.status}
                  </span>
                </div>
              </div>
            </div>

            {/* WhatsApp Builder Preview */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-md font-semibold text-black mb-4">Campaign Design</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <WhatsAppCampaignBuilder
                  campaign={campaign}
                  embedded={true}
                  previewOnly={true}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-white rounded-b-lg">
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
