'use client';

import { SkeletonCampaignsPage } from '@/components/skeleton/SkeletonCampaignsPage';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, X, ArrowRight } from 'lucide-react';
import CampaignTable from '@/components/salesmarketing/CampaignTable';
import { Campaign, CampaignTableRow } from '@/types/campaign';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tCampaigns } = useMarketingTranslations();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showTip, setShowTip] = useState(true);

  const CAMPAIGNS_QUERY = `
    query GetCampaigns($userId: Int!, $page: Int, $limit: Int, $status: String) {
      campaigns(userId: $userId, page: $page, limit: $limit, status: $status) {
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

  const fetchCampaigns = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchGraphQL<{
        campaigns: {
          nodes: Campaign[];
          pagination: {
            page: number;
            limit: number;
            totalCount: number;
            totalPages: number;
          };
        };
      }>(CAMPAIGNS_QUERY, {
        userId: user.id,
        page: 1,
        limit: 100,
      });

      setCampaigns(data.campaigns.nodes);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const campaignToTableRow = (campaign: Campaign): CampaignTableRow => {
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
  };

  const handleViewCampaign = (campaign: Campaign) => {
    // If campaign is Draft, open in edit mode, otherwise view mode
    const mode = campaign.status === 'Draft' ? 'edit' : 'view';
    router.push(`/marketing/campaigns/details?id=${campaign.id}&mode=${mode}`);
  };

  const handleDuplicateCampaign = (campaign: Campaign) => {
    // TODO: Implement duplicate functionality
  };

  const handleUpdateCampaign = async (
    updatedCampaign: Campaign,
    sendChannel?: 'whatsapp' | 'email' | 'both',
  ) => {
    if (!user?.id) return;

    const UPDATE_CAMPAIGN_MUTATION = `
      mutation UpdateCampaign(
        $userId: Int!
        $id: String!
        $name: String
        $description: String
        $status: String
        $recipients: String
        $sentDate: String
        $opensCount: Int
        $clicksCount: Int
        $revenue: Float
        $orders: Int
        $contentBlocks: JSONObject
        $sendChannel: String
      ) {
        updateCampaign(
          userId: $userId
          id: $id
          name: $name
          description: $description
          status: $status
          recipients: $recipients
          sentDate: $sentDate
          opensCount: $opensCount
          clicksCount: $clicksCount
          revenue: $revenue
          orders: $orders
          contentBlocks: $contentBlocks
          sendChannel: $sendChannel
        ) {
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
      }
    `;

    try {
      const data = await fetchGraphQL<{ updateCampaign: Campaign }>(UPDATE_CAMPAIGN_MUTATION, {
        userId: user.id,
        id: updatedCampaign.id,
        name: updatedCampaign.name,
        description: updatedCampaign.description || null,
        status: updatedCampaign.status,
        recipients: updatedCampaign.recipients,
        sentDate: updatedCampaign.sentDate || null,
        opensCount: updatedCampaign.opensCount,
        clicksCount: updatedCampaign.clicksCount,
        revenue: updatedCampaign.revenue,
        orders: updatedCampaign.orders,
        contentBlocks: updatedCampaign.contentBlocks || null,
        sendChannel: sendChannel || null,
      });
      
      // Update the campaign in the state
      setCampaigns(prev => prev.map(c => c.id === data.updateCampaign.id ? data.updateCampaign : c));
    } catch (error) {
      console.error('Failed to update campaign:', error);
      // Consider adding toast notification or error state
      // Example: toast.error('Failed to update campaign. Please try again.');
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (!user?.id) return;

    const DELETE_CAMPAIGN_MUTATION = `
      mutation DeleteCampaign($userId: Int!, $id: String!) {
        deleteCampaign(userId: $userId, id: $id) {
          success
          deleted {
            id
          }
        }
      }
    `;

    try {
      await fetchGraphQL(DELETE_CAMPAIGN_MUTATION, {
        userId: user.id,
        id: campaign.id,
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to delete campaign');
    }
  };

  if (loading) {
    return <SkeletonCampaignsPage />;
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-black mb-2">{tCampaigns('title')}</h1>
        </div>
        <Link
          href="/marketing/campaigns/create"
          className="inline-flex items-center gap-2 px-6 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          {tCampaigns('createCampaign')}
        </Link>
      </div>

      {/* Informational Tip Banner */}
      {showTip && (
        <div className="relative rounded-lg border border-[#e6e6e6] bg-blue-50 p-4 mb-3">
          <button
            onClick={() => setShowTip(false)}
            className="absolute top-3 right-3 p-1 hover:bg-blue-100 rounded-full transition-colors"
            aria-label={tCampaigns('dismissTip')}
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
          <div className="pr-8">
            <p className="text-sm text-gray-700 mb-2">
              {tCampaigns('tipBanner')}
            </p>
            <Link
              href="/marketing/campaigns/create"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#0a61d7] hover:text-[#084ba6] transition-colors"
            >
              {tCampaigns('createCampaign')}
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
        onUpdateCampaign={handleUpdateCampaign}
        campaignToTableRow={campaignToTableRow}
        onRefresh={fetchCampaigns}
      />
    </div>
  );
}
