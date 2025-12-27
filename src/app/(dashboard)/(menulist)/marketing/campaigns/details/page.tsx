'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CampaignDetails from '@/components/salesmarketing/CampaignDetails';
import { Campaign } from '@/types/campaign';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

export default function CampaignDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const campaignId = searchParams.get('id');
  const modeParam = searchParams.get('mode');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  // Calculate mode during render based on URL param and campaign status
  // Follows React best practice: calculate derived state during render, not in useEffect
  const canEdit = campaign?.status === 'Draft';
  const mode: 'view' | 'edit' = (modeParam === 'edit' && canEdit) ? 'edit' : 'view';

  useEffect(() => {
    const fetchCampaign = async () => {
      if (!user?.id || !campaignId) return;

      try {
        setLoading(true);

        const CAMPAIGN_QUERY = `
          query GetCampaign($userId: Int!, $id: String!) {
            campaign(userId: $userId, id: $id) {
              id
              campaignId
              name
              description
              status
              sentDate
              recipients
              openedPercent
              clickedPercent
              revenue
              orders
              contentBlocks
              userId
              createdAt
              updatedAt
            }
          }
        `;

        const data = await fetchGraphQL<{
          campaign: Campaign | null;
        }>(CAMPAIGN_QUERY, {
          userId: user.id,
          id: campaignId,
        });

        if (data.campaign) {
          setCampaign(data.campaign);
        } else {
          router.push('/marketing/campaigns');
        }
      } catch (error) {
        router.push('/marketing/campaigns');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaign();
  }, [user?.id, campaignId, router]);

  const handleSave = async (updatedCampaign: Campaign) => {
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
        $openedPercent: Float
        $clickedPercent: Float
        $revenue: Float
        $orders: Int
        $contentBlocks: JSONObject
      ) {
        updateCampaign(
          userId: $userId
          id: $id
          name: $name
          description: $description
          status: $status
          recipients: $recipients
          sentDate: $sentDate
          openedPercent: $openedPercent
          clickedPercent: $clickedPercent
          revenue: $revenue
          orders: $orders
          contentBlocks: $contentBlocks
        ) {
          id
          campaignId
          name
          description
          status
          sentDate
          recipients
          openedPercent
          clickedPercent
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
      await fetchGraphQL(UPDATE_CAMPAIGN_MUTATION, {
        userId: user.id,
        id: updatedCampaign.id,
        name: updatedCampaign.name,
        description: updatedCampaign.description || null,
        status: updatedCampaign.status,
        recipients: updatedCampaign.recipients,
        sentDate: updatedCampaign.sentDate || null,
        openedPercent: updatedCampaign.openedPercent,
        clickedPercent: updatedCampaign.clickedPercent,
        revenue: updatedCampaign.revenue,
        orders: updatedCampaign.orders,
        contentBlocks: updatedCampaign.contentBlocks || null,
      });
      router.push('/marketing/campaigns');
    } catch (error) {
      // Handle error
    }
  };

  const handleCancel = () => {
    router.push('/marketing/campaigns');
  };

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Campaign not found</p>
          <button
            onClick={() => router.push('/marketing/campaigns')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <CampaignDetails
        mode={mode}
        campaign={campaign}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}

