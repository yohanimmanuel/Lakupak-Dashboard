'use client';

import SupplierProfile from '@/components/clientmanagement/SupplierProfile';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function SupplierDetailsPage() {
  const params = useParams();
  const id = params.id;
  const { data: supplier, error, isLoading, mutate } = useSWR(id ? `/api/suppliers?id=${id}` : null, fetcher, { revalidateOnFocus: true });

  if (isLoading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error.message || 'Error loading supplier'}</div>;
  if (!supplier) return <div className="p-4">No supplier found.</div>;

  return (
    <div className="w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierProfile supplier={supplier} />
    </div>
  );
}
