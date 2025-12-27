'use client';

import React from 'react';
import CampaignDetails from '@/components/salesmarketing/CampaignDetails';
import { useRouter } from 'next/navigation';
import { Campaign } from '@/types/campaign';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';

export default function CreateCampaignPage() {
  const router = useRouter();
  const user = useUserStore(state => state.user);

  const handleSave = async (campaign: Campaign) => {
    if (!user?.id) return;

    const CREATE_CAMPAIGN_MUTATION = `
      mutation CreateCampaign(
        $userId: Int!
        $campaignId: String
        $name: String!
        $description: String
        $status: String
        $recipients: String!
        $contentBlocks: JSONObject
      ) {
        createCampaign(
          userId: $userId
          campaignId: $campaignId
          name: $name
          description: $description
          status: $status
          recipients: $recipients
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
      const result = await fetchGraphQL(CREATE_CAMPAIGN_MUTATION, {
        userId: user.id,
        campaignId: campaign.campaignId || null,
        name: campaign.name,
        description: campaign.description || null,
        status: campaign.status || 'Draft',
        recipients: campaign.recipients || 'No recipients yet',
        contentBlocks: campaign.contentBlocks || null,
      });
      router.push('/marketing/campaigns');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create campaign. Please try again.');
    }
  };

  const handleCancel = () => {
    router.push('/marketing/campaigns');
  };

  return (
    <div className="w-full mx-auto bg-gradient-to-b from-gray-50 to-white min-h-screen p-4">
      <CampaignDetails mode="add" onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}

