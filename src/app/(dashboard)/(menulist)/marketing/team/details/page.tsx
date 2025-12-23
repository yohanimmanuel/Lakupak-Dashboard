'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SalesDetails from '@/components/salesmarketing/SalesDetails';
import { SalesAgent } from '@/components/salesmarketing/TeamList';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<SalesAgent | null>(null);

  useEffect(() => {
    const agentId = searchParams.get('id');
    
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
  }, [searchParams, user?.id, router]);

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading agent details...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Agent not found</p>
          <button
            onClick={() => router.push('/marketing/team')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Back to Team List
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
