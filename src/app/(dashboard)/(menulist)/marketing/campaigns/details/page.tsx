'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CampaignDetails from '@/components/salesmarketing/CampaignDetails';
import { Campaign } from '@/types/campaign';
import { useUserStore } from '@/store/userStore';

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
        // TODO: Replace with actual GraphQL query
        // For now, use mock data based on the campaigns page
        const mockCampaigns: Campaign[] = [
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
        ];

        const foundCampaign = mockCampaigns.find((c) => c.id === campaignId);
        if (foundCampaign) {
          setCampaign(foundCampaign);
        } else {
          router.push('/marketing/campaigns');
        }
      } catch (error) {
        // Handle error
        router.push('/marketing/campaigns');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaign();
  }, [user?.id, campaignId, router]);

  const handleSave = async (updatedCampaign: Campaign) => {
    // TODO: Implement GraphQL mutation to update campaign
    // For now, just navigate back
    router.push('/marketing/campaigns');
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

