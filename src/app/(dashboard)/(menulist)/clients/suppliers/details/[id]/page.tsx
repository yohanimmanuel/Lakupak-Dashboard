'use client';

import SupplierProfile from '@/components/clientmanagement/SupplierProfile';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function SupplierDetailsPage() {
  const params = useParams();
  const user = useUserStore(state => state.user);
  const [id, setId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (params?.id) setId(params.id as string);
  }, [params]);

  // Enhanced SWR configuration with error handling and retry logic
  const { data: supplier, error, isLoading, mutate } = useSWR(
    user?.id && id ? `/api/suppliers?id=${id}&userId=${user.id}` : null,
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

  if (!supplier || supplier.error) {
    return (
      <div className="p-4 w-full min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center">
          <div className="text-gray-500 text-lg font-semibold mb-2">Supplier Not Found</div>
          <div className="text-gray-600">The requested supplier could not be found or you don&apos;t have permission to view it.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierProfile supplier={supplier} />
    </div>
  );
}
