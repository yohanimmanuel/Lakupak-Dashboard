'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SalesDetails from '@/components/salesmarketing/SalesDetails';
import { SalesAgent } from '@/components/salesmarketing/TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useMarketingTranslations } from '@/hooks/useMarketingTranslations';
import { SkeletonAgentDetailPage } from '@/components/skeleton/SkeletonAgentDetailPage';

const GET_SALES_AGENT_QUERY = `
  query GetSalesAgent($userId: Int!, $id: String!) {
    salesAgent(userId: $userId, id: $id) {
      id
      name
      email
      phone
      role
      status
      avatar
      territory
      bio
      sex
      teamId
      teamName
      favoriteProducts {
        productId
        name
        productType
        brand
        images
        sellingPrice
      }
      fieldReports {
        id
        date
        location
        startTime
        endTime
        activities
        notes
      }
      salesTargets {
        id
        period
        goal
        achieved
        unitsSold
      }
      createdAt
      updatedAt
    }
  }
`;

export default function SalesDetailsPage() {
  const { tSalesDetails } = useMarketingTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const agentId = searchParams?.get('id') ?? null;
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<SalesAgent | null>(null);

  useEffect(() => {
    if (!agentId || !user?.id) {
      if (!agentId) router.push('/marketing/team');
      return;
    }

    const fetchAgent = async () => {
      setLoading(true);
      
      try {
        const data = await fetchGraphQL<{
          salesAgent: SalesAgent | null;
        }>(GET_SALES_AGENT_QUERY, {
          userId: user.id,
          id: agentId,
        });

        if (!data.salesAgent) {
          setAgent(null);
        } else {
          setAgent(data.salesAgent);
        }
      } catch (error) {
        console.error('Error fetching agent:', error);
        setAgent(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAgent();
  }, [agentId, user?.id, router]);

  if (loading) {
    return <SkeletonAgentDetailPage />;
  }

  if (!agent) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{tSalesDetails('notFound')}</p>
          <button
            onClick={() => router.push('/marketing/team')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            {tSalesDetails('backToTeamListButton')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="w-full mx-auto">
        <SalesDetails
          agent={agent}
          onBack={() => router.push('/marketing/team')}
          onEdit={() => {
            router.push(`/marketing/team/edit?id=${agent.id}`);
          }}
        />
      </div>
    </div>
  );
}
