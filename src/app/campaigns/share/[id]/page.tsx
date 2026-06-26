'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Campaign } from '@/types/campaign';
import CampaignPreview from '@/components/salesmarketing/CampaignPreview';

type CampaignShareErrorKind = 'notFound' | 'loadFailed';

export default function CampaignSharePage() {
  const params = useParams();
  const campaignId = (params?.id as string | undefined) ?? null;
  const t = useTranslations('dashboard.marketing.campaignShare');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<CampaignShareErrorKind | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    let ignore = false;

    const fetchCampaign = async () => {
      try {
        setLoading(true);
        setErrorKind(null);

        const response = await fetch(`/api/campaigns/share/${campaignId}`);

        if (!response.ok) {
          if (!ignore) {
            setErrorKind(response.status === 404 ? 'notFound' : 'loadFailed');
          }
          return;
        }

        const data = await response.json();

        if (!ignore) {
          setCampaign(data);

          try {
            await fetch(`/api/campaigns/track/${campaignId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ type: 'open' }),
            });
          } catch {
            // Tracking failure must not break the public page.
          }
        }
      } catch {
        if (!ignore) {
          setErrorKind('loadFailed');
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
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (errorKind || !campaign) {
    const kind: CampaignShareErrorKind = errorKind ?? 'notFound';
    const errorTitle = kind === 'loadFailed' ? t('loadFailed') : t('notFound');
    const errorDescription = kind === 'notFound' ? t('notFoundDescription') : null;

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <p className="text-red-600 text-lg font-semibold">{errorTitle}</p>
          {errorDescription && <p className="text-gray-600 text-sm">{errorDescription}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="min-w-0">
              <h1 className="text-2xl font-bold text-black">{campaign.name}</h1>
              {campaign.description && (
                <p className="text-sm text-gray-600 mt-1">{campaign.description}</p>
              )}
            </div>
        </div>
      </div>

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
              } catch {
                // Silently fail tracking
              }
            }}
          />
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-gray-500">{t('poweredBy')}</p>
        </div>
      </div>
    </div>
  );
}
