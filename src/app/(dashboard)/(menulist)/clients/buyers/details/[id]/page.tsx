'use client';

import BuyerProfile from '@/components/clientmanagement/BuyerProfile';
import { SkeletonClientProfilePage } from '@/components/skeleton/SkeletonClientProfilePage';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React from 'react';
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
      subChannel
      outletExamples
      address
      status
      logistics
      notes
      orderDetails
      returnDetails
      orderLineDetails
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

  const showSkeleton =
    !isHydrated ||
    isLoading ||
    (Boolean(user?.id && id) && !buyer && !error);

  if (showSkeleton) {
    return <SkeletonClientProfilePage />;
  }

  if (!id) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">{tPage('notFound')}</div>
          <div className="text-gray-600">{tPage('notFoundDescription')}</div>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">{tPage('authRequired')}</div>
          <div className="text-gray-600">{tPage('loginRequired')}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
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
      <div className="flex h-full min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="max-w-md rounded-lg border border-[#e6e6e6] bg-white p-8 text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">{tBuyers('deleted.title')}</h1>
          <p className="mb-6 text-sm text-gray-600">{tBuyers('deleted.description')}</p>
          {id ? (
            <p className="mb-4 text-xs text-gray-500">{tBuyers('deleted.reference', { id })}</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              window.location.href = '/clients/buyers';
            }}
            className="rounded-lg bg-[#0a61d7] px-4 py-2 text-sm text-white transition-colors hover:bg-[#0851b8]"
          >
            {tBuyers('deleted.backToList')}
          </button>
        </div>
      </div>
    );
  }

  if ('error' in buyer) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">{tPage('error')}</div>
          <div className="text-gray-600">{buyer.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col items-stretch justify-start bg-gradient-to-b from-gray-50 to-white p-4">
      <BuyerProfile buyer={buyer} onUpdate={mutate} />
    </div>
  );
}
