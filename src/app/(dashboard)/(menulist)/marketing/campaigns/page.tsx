'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, X, ArrowRight } from 'lucide-react';
import CampaignTable from '@/components/salesmarketing/CampaignTable';
import { Campaign, CampaignTableRow } from '@/types/campaign';

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showTip, setShowTip] = useState(true);

  useEffect(() => {
    // TODO: Replace with actual GraphQL query
    // Simulate data loading
    const timer = setTimeout(() => {
      setLoading(false);
      // Mock data for now
      setCampaigns([
        {
          id: '1',
          campaignId: 'CAMP001',
          name: 'New products! Summer 2023',
          status: 'Sent',
          sentDate: '2023-03-15T10:57:00Z',
          recipients: 'All Contacts',
          openedPercent: 15,
          clickedPercent: 0.38,
          revenue: 0,
          orders: 0,
        },
        {
          id: '2',
          campaignId: 'CAMP002',
          name: 'Q12023 Flash Promo',
          status: 'Sent',
          sentDate: '2023-02-16T09:00:00Z',
          recipients: 'Not signed up, Unused credit',
          openedPercent: 29,
          clickedPercent: 0.43,
          revenue: 4302,
          orders: 7,
        },
        {
          id: '3',
          campaignId: 'CAMP003',
          name: 'NYC Pop-Up Announcement',
          status: 'Draft',
          lastEdited: '2022-12-02T13:43:00Z',
          recipients: 'No recipients yet',
          openedPercent: 0,
          clickedPercent: 0,
          revenue: 0,
          orders: 0,
        },
        {
          id: '4',
          campaignId: 'CAMP004',
          name: 'Paris Pop-Up Announcement',
          status: 'Draft',
          lastEdited: '2022-12-02T09:41:00Z',
          recipients: 'No recipients yet',
          openedPercent: 0,
          clickedPercent: 0,
          revenue: 0,
          orders: 0,
        },
      ]);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const campaignToTableRow = (campaign: Campaign): CampaignTableRow => {
    return {
      id: campaign.id,
      campaignId: campaign.campaignId,
      name: campaign.name,
      status: campaign.status,
      sentDate: campaign.sentDate,
      lastEdited: campaign.lastEdited,
      recipients: campaign.recipients,
      openedPercent: campaign.openedPercent,
      clickedPercent: campaign.clickedPercent,
      revenue: campaign.revenue,
      orders: campaign.orders,
    };
  };

  const handleViewCampaign = (campaign: Campaign) => {
    // If campaign is Draft, open in edit mode, otherwise view mode
    const mode = campaign.status === 'Draft' ? 'edit' : 'view';
    router.push(`/marketing/campaigns/details?id=${campaign.id}&mode=${mode}`);
  };

  const handleDuplicateCampaign = (campaign: Campaign) => {
    // TODO: Implement duplicate functionality
    console.log('Duplicate campaign:', campaign);
  };

  const handleDeleteCampaign = (campaign: Campaign) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black mb-2">Campaigns</h1>
          <p className="text-sm text-gray-600">
            Send one-time rich content emails to your retailers.
          </p>
        </div>
        <Link
          href="/marketing/campaigns/create"
          className="inline-flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Create campaign
        </Link>
      </div>

      {/* Informational Tip Banner */}
      {showTip && (
        <div className="relative rounded-lg border border-gray-100 bg-blue-50 p-4 mb-6 shadow-sm">
          <button
            onClick={() => setShowTip(false)}
            className="absolute top-3 right-3 p-1 hover:bg-blue-100 rounded-full transition-colors"
            aria-label="Dismiss tip"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
          <div className="pr-8">
            <p className="text-sm text-gray-700 mb-2">
              Invite 22 customers who joined Faire in the past week to shop if they place an order, you could earn new customers through Faire Direct Rewards.
            </p>
            <Link
              href="/marketing/campaigns/create"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#0a61d7] hover:text-[#084ba6] transition-colors"
            >
              Create campaign
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Campaign Table */}
      <CampaignTable
        campaigns={campaigns}
        onViewCampaign={handleViewCampaign}
        onDuplicateCampaign={handleDuplicateCampaign}
        onDeleteCampaign={handleDeleteCampaign}
        campaignToTableRow={campaignToTableRow}
      />
    </div>
  );
}
