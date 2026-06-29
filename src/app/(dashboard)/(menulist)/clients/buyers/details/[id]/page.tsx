'use client';

import BuyerProfile from '@/components/clientmanagement/BuyerProfile';
import { SkeletonClientProfilePage } from '@/components/skeleton/SkeletonClientProfilePage';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect } from 'react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { Buyer } from '@/types/client';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

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
  const { tBuyers, tCommon } = useClientsTranslations();
  const tPage = (key: string, values?: Record<string, string | number>) =>
    tBuyers(`detailsPage.${key}` as Parameters<typeof tBuyers>[0], values);
  const params = useParams();
  const isHydrated = useUserStore(state => state.isHydrated);
  const user = useUserStore(state => state.user);
  const id = typeof params?.id === 'string' ? params.id : undefined;

  const { data: buyer, error, isLoading, mutate } = useSWR(
    user?.id && id ? `${user.id}|${id}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 1000,
      dedupingInterval: 5000,
    },
  );

  useEffect(() => {
    if (buyer && 'error' in buyer && buyer.error === 'Buyer not found') {
      const ref = encodeURIComponent(String(id || ''));
      window.location.href = `/clients/buyers/deleted?id=${ref}`;
    }
  }, [buyer, id]);

  const showSkeleton =
    !isHydrated ||
    isLoading ||
    (Boolean(user?.id && id) && !buyer && !error);

  if (showSkeleton) {
    return <SkeletonClientProfilePage />;
  }

  if (!id) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">{tPage('notFound')}</div>
          <div className="text-gray-600">{tPage('notFoundDescription')}</div>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">{tPage('authRequired')}</div>
          <div className="text-gray-600">{tPage('loginRequired')}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">{tPage('errorTitle')}</div>
          <div className="text-gray-600 mb-4">{error.message || tPage('unexpectedError')}</div>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition"
          >
            {tCommon('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!buyer || ('error' in buyer && buyer.error === 'Buyer not found')) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">{tPage('deletedRedirect')}</div>
          <div className="text-gray-600">{tPage('redirecting')}</div>
        </div>
      </div>
    );
  }

  if ('error' in buyer) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">{tPage('error')}</div>
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
