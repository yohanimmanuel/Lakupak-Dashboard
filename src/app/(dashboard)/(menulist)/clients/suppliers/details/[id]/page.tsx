'use client';

import SupplierProfile from '@/components/clientmanagement/SupplierProfile';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';
import { fetchGraphQL } from '@/lib/graphqlClient';
import type { Supplier } from '@/types/client';

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
  const params = useParams();
  const user = useUserStore(state => state.user);
  const [id, setId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (params?.id) setId(params.id as string);
  }, [params]);

  // Enhanced SWR configuration with error handling and retry logic
  const { data: supplier, error, isLoading, mutate } = useSWR(
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

  // Enhanced error handling and loading states
  if (!user?.id || !id) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Authentication Required</div>
          <div className="text-gray-600">Please log in to view supplier details.</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading supplier details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Error Loading Supplier</div>
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

  if (!supplier) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">Supplier Not Found</div>
          <div className="text-gray-600">The requested supplier could not be found or you don&apos;t have permission to view it.</div>
        </div>
      </div>
    );
  }

  // Type guard: check if supplier has an error
  if ('error' in supplier) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">Error</div>
          <div className="text-gray-600">{supplier.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierProfile supplier={supplier} onUpdate={mutate} />
    </div>
  );
}
