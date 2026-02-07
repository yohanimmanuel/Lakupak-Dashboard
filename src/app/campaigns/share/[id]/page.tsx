'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Campaign } from '@/types/campaign';
import CampaignPreview from '@/components/salesmarketing/CampaignPreview';

export default function CampaignSharePage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    let ignore = false;

    const fetchCampaign = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/campaigns/share/${campaignId}`);
        
        if (!response.ok) {
          if (!ignore) {
            if (response.status === 404) {
              setError('Campaign not found');
            } else {
              setError('Failed to load campaign');
            }
          }
          return;
        }

        const data = await response.json();
        
        if (!ignore) {
          setCampaign(data);
          
          // Track campaign open
          try {
            await fetch(`/api/campaigns/track/${campaignId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ type: 'open' }),
            });
          } catch (trackError) {
            // Silently fail tracking - don't break the page if tracking fails
          }
        }
      } catch (err) {
        if (!ignore) {
          setError('Failed to load campaign');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchCampaign();

    return () => {
      ignore = true;
    };
  }, [campaignId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-red-600 mb-4 text-lg font-semibold">{error || 'Campaign not found'}</p>
          <p className="text-gray-600 text-sm">
            The campaign you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-black">{campaign.name}</h1>
              {campaign.description && (
                <p className="text-sm text-gray-600 mt-1">{campaign.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <CampaignPreview
            campaign={campaign}
            onTrackClick={async () => {
              try {
                await fetch(`/api/campaigns/track/${campaignId}`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ type: 'click' }),
                });
              } catch (error) {
                // Silently fail tracking
              }
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-500">
            Powered by Laku
          </p>
        </div>
      </div>
    </div>
  );
}

