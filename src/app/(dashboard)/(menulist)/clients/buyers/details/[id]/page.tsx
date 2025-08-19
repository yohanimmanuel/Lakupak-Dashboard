'use client';

import BuyerProfile from '@/components/clientmanagement/BuyerProfile';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BuyerDetailsPage() {
  const params = useParams();
  const id = params.id;
  const { data: buyer, error, isLoading, mutate } = useSWR(id ? `/api/buyers?id=${id}` : null, fetcher, { revalidateOnFocus: true });

  if (isLoading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error.message || 'Error loading buyer'}</div>;
  if (!buyer) return <div className="p-4">No buyer found.</div>;

  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <BuyerProfile buyer={buyer} />
    </div>
  );
}
