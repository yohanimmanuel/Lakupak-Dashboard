'use client';

import React from 'react';
import CampaignDetails from '@/components/salesmarketing/CampaignDetails';
import { useRouter } from 'next/navigation';
import { Campaign } from '@/types/campaign';

export default function CreateCampaignPage() {
  const router = useRouter();

  const handleSave = async (campaign: Campaign) => {
    // TODO: Implement GraphQL mutation to save campaign
    // For now, just navigate back
    router.push('/marketing/campaigns');
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

