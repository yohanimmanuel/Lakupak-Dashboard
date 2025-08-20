'use client';

import BuyerProfile from '@/components/clientmanagement/BuyerProfile';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useUserStore } from '@/store/userStore';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BuyerDetailsPage() {
  const params = useParams();
  const user = useUserStore(state => state.user);
  const [id, setId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (params?.id) setId(params.id as string);
  }, [params]);

  // Always call useSWR
  const { data: buyer, error, isLoading, mutate } = useSWR(
    user?.id && id ? `/api/buyers?id=${id}&userId=${user.id}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  if (!user?.id || !id) return null;
  if (isLoading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error.message || 'Error loading buyer'}</div>;
  if (!buyer || buyer.error) return <div className="p-4">No buyer found.</div>;

  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <BuyerProfile buyer={buyer} />
    </div>
  );
}
