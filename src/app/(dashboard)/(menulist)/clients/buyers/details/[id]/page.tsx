'use client';

import BuyerProfile from '@/components/clientmanagement/BuyerProfile';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { Buyer } from '@/types/client';

const BUYER_QUERY = `
  query GetBuyer($userId: Int!, $id: String!) {
    buyer(userId: $userId, id: $id) {
      id
      buyerId
      avatar
      owner
      storeName
      email
      phone
      businessType
      address
      status
      logistics
      notes
      orderDetails
      avgMonthlySpending
      avgMonthlyOrders
      userId
      createdAt
      updatedAt
    }
  }
`;

type BuyerResponse = Buyer | { error: string };

const fetcher = async (key: string): Promise<BuyerResponse | null> => {
  const [userId, id] = key.split('|');
  if (!userId || !id) return null;
  
  try {
    const data = await fetchGraphQL<{ buyer: Buyer | null }>(BUYER_QUERY, {
      userId: Number(userId),
      id,
    });
    
    if (!data.buyer) {
      return { error: 'Buyer not found' };
    }
    
    return data.buyer;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return { error: 'Buyer not found' };
    }
    throw error;
  }
};

export default function BuyerDetailsPage() {
  const params = useParams();
  const user = useUserStore(state => state.user);
  const [id, setId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (params?.id) setId(params.id as string);
  }, [params]);

  // Enhanced SWR configuration with error handling and retry logic
  const { data: buyer, error, isLoading, mutate } = useSWR(
    user?.id && id ? `${user.id}|${id}` : null,
    fetcher,
    { 
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 1000,
      dedupingInterval: 5000
    }
  );

  // Redirect to deleted page if API indicates missing buyer
  useEffect(() => {
    if (buyer && ('error' in buyer && buyer.error === 'Buyer not found')) {
      const ref = encodeURIComponent(String(id || ''));
      window.location.href = `/clients/buyers/deleted?id=${ref}`;
    }
  }, [buyer, id]);

  // Enhanced error handling and loading states
  if (!user?.id || !id) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Authentication Required</div>
          <div className="text-gray-600">Please log in to view buyer details.</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading buyer details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Error Loading Buyer</div>
          <div className="text-gray-600 mb-4">{error.message || 'An unexpected error occurred'}</div>
          <button 
            onClick={() => mutate()} 
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!buyer || ('error' in buyer && buyer.error === 'Buyer not found')) {
    // Fallback UI in case redirect didn't happen
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">Buyer has been deleted</div>
          <div className="text-gray-600">Redirecting to deleted notice...</div>
        </div>
      </div>
    );
  }

  // Type guard: ensure buyer is a valid Buyer object
  if ('error' in buyer) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Error</div>
          <div className="text-gray-600">{buyer.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <BuyerProfile buyer={buyer} onUpdate={mutate} />
    </div>
  );
}
