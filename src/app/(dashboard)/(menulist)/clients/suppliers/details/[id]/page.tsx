'use client';

import SupplierProfile from '@/components/clientmanagement/SupplierProfile';
import { SkeletonClientProfilePage } from '@/components/skeleton/SkeletonClientProfilePage';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React from 'react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { Supplier } from '@/types/client';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

const SUPPLIER_QUERY = `
  query GetSupplier($userId: Int!, $id: String!) {
    supplier(userId: $userId, id: $id) {
      id
      supplierId
      name
      contact
      email
      phone
      businessType
      address
      status
      logistics
      notes
      supplies
      avgMonthlyPurchaseValue
      totalPurchases
      totalSupplies
      onTimeDeliveryRate
      userId
      createdAt
      updatedAt
    }
  }
`;

type SupplierResponse = Supplier | { error: string };

const fetcher = async (key: string): Promise<SupplierResponse | null> => {
  const [userId, id] = key.split('|');
  if (!userId || !id) return null;

  try {
    const data = await fetchGraphQL<{ supplier: Supplier | null }>(SUPPLIER_QUERY, {
      userId: Number(userId),
      id,
    });

    if (!data.supplier) {
      return { error: 'Supplier not found' };
    }

    return data.supplier;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return { error: 'Supplier not found' };
    }
    throw error;
  }
};

export default function SupplierDetailsPage() {
  const { tSuppliers, tCommon } = useClientsTranslations();
  const tPage = (key: string, values?: Record<string, string | number>) =>
    tSuppliers(`detailsPage.${key}` as Parameters<typeof tSuppliers>[0], values);
  const params = useParams();
  const isHydrated = useUserStore(state => state.isHydrated);
  const user = useUserStore(state => state.user);
  const id = typeof params?.id === 'string' ? params.id : undefined;

  const { data: supplier, error, isLoading, mutate } = useSWR(
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
    (Boolean(user?.id && id) && !supplier && !error);

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

  if (!supplier) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">{tPage('notFound')}</div>
          <div className="text-gray-600">{tPage('notFoundDescription')}</div>
        </div>
      </div>
    );
  }

  if ('error' in supplier) {
    return (
      <div className="flex min-h-full w-full min-w-0 flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white p-4">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">{tPage('error')}</div>
          <div className="text-gray-600">{supplier.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col items-stretch justify-start bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierProfile supplier={supplier} onUpdate={mutate} />
    </div>
  );
}
